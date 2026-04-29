import os
import shutil
import struct
from pathlib import Path
from shutil import copy
from subprocess import STDOUT, CalledProcessError, check_output

from utils import add_outlines, fnd, fnd_all, fnd_rvrs, fnd_unuse_no, find_redundant_images

try:
    from PyPDF2 import errors
except ImportError:
    from PyPDF2 import utils as errors

KDH_PASSPHRASE = b"FZHMEI"


class CAJParser(object):
    def __init__(self, filename):
        self.filename = filename
        try:
            with open(filename, "rb") as caj:
                caj_read4 = caj.read(4)
                if caj_read4[0:1] == b"\xc8":
                    self.format = "C8"
                    self._PAGE_NUMBER_OFFSET = 0x08
                    self._TOC_NUMBER_OFFSET = 0
                    self._TOC_END_OFFSET = 0x50
                    self._PAGEDATA_OFFSET = self._TOC_END_OFFSET + 20 * self.page_num
                    return
                if caj_read4[0:2] == b"HN":
                    if caj.read(2) == b"\xc8\x00":
                        self.format = "HN"
                        self._PAGE_NUMBER_OFFSET = 0x90
                        self._TOC_NUMBER_OFFSET = 0
                        self._TOC_END_OFFSET = 0xD8
                        self._PAGEDATA_OFFSET = self._TOC_END_OFFSET + 20 * self.page_num
                        return
                fmt = struct.unpack("4s", caj_read4)[0].replace(b"\x00", b"").decode("gb18030")
            if fmt == "CAJ":
                self.format = "CAJ"
                self._PAGE_NUMBER_OFFSET = 0x10
                self._TOC_NUMBER_OFFSET = 0x110
            elif fmt == "HN":
                self.format = "HN"
                self._PAGE_NUMBER_OFFSET = 0x90
                self._TOC_NUMBER_OFFSET = 0x158
                self._TOC_END_OFFSET = self._TOC_NUMBER_OFFSET + 4 + 0x134 * self.toc_num
                self._PAGEDATA_OFFSET = self._TOC_END_OFFSET + 20 * self.page_num
            elif fmt == "%PDF":
                self.format = "PDF"
            elif fmt == "KDH ":
                self.format = "KDH"
            elif fmt == "TEB":
                self.format = "TEB"
            else:
                self.format = None
                raise SystemExit("Unknown file type.")
        except UnicodeDecodeError:
            raise SystemExit("Unknown file type.")

    @property
    def page_num(self):
        with open(self.filename, "rb") as caj:
            caj.seek(self._PAGE_NUMBER_OFFSET)
            [page_num] = struct.unpack("i", caj.read(4))
            return page_num

    @property
    def toc_num(self):
        if self._TOC_NUMBER_OFFSET == 0:
            return 0
        with open(self.filename, "rb") as caj:
            caj.seek(self._TOC_NUMBER_OFFSET)
            [toc_num] = struct.unpack("i", caj.read(4))
            return toc_num

    def get_toc(self):
        toc = []
        if self._TOC_NUMBER_OFFSET == 0:
            return toc
        with open(self.filename, "rb") as caj:
            for i in range(self.toc_num):
                caj.seek(self._TOC_NUMBER_OFFSET + 4 + 0x134 * i)
                toc_bytes = struct.unpack("256s24s12s12si", caj.read(0x134))
                ttl_end = toc_bytes[0].find(b"\x00")
                title = toc_bytes[0][0:ttl_end].decode("gb18030").encode("utf-8")
                pg_end = toc_bytes[2].find(b"\x00")
                page = int(toc_bytes[2][0:pg_end])
                level = toc_bytes[4]
                toc.append({"title": title, "page": page, "level": level})
        return toc

    def convert(self, dest):
        if self.format == "CAJ":
            self._convert_caj(dest)
        elif self.format == "HN":
            raise SystemExit("HN format is not enabled in this minimal Windows build.")
        elif self.format == "C8":
            raise SystemExit("C8 format is not enabled in this minimal Windows build.")
        elif self.format == "PDF":
            self._convert_pdf(dest)
        elif self.format == "KDH":
            self._convert_kdh(dest)
        else:
            raise SystemExit(f"Unsupported file type: {self.format}.")

    def _convert_caj(self, dest):
        caj = open(self.filename, "rb")
        caj.seek(self._PAGE_NUMBER_OFFSET + 4)
        [pdf_start_pointer] = struct.unpack("i", caj.read(4))
        caj.seek(pdf_start_pointer)
        [pdf_start] = struct.unpack("i", caj.read(4))
        pdf_end = fnd_all(caj, b"endobj")[-1] + 6
        pdf_length = pdf_end - pdf_start
        caj.seek(pdf_start)
        pdf_data = b"%PDF-1.3\r\n" + caj.read(pdf_length) + b"\r\n"
        with open("pdf.tmp", "wb") as f:
            f.write(pdf_data)
        pdf = open("pdf.tmp", "rb")

        endobj_addr = fnd_all(pdf, b"endobj")
        obj_no = []
        for addr in endobj_addr:
            startobj = fnd_rvrs(pdf, b" 0 obj", addr)
            startobj1 = fnd_rvrs(pdf, b"\r", startobj)
            startobj2 = fnd_rvrs(pdf, b"\n", startobj)
            startobj = max(startobj1, startobj2)
            length = fnd(pdf, b" ", startobj) - startobj
            pdf.seek(startobj)
            [no] = struct.unpack(str(length) + "s", pdf.read(length))
            if int(no) not in obj_no:
                obj_no.append(int(no))

        inds_addr = [i + 8 for i in fnd_all(pdf, b"/Parent")]
        inds = []
        for addr in inds_addr:
            length = fnd(pdf, b" ", addr) - addr
            pdf.seek(addr)
            [ind] = struct.unpack(str(length) + "s", pdf.read(length))
            inds.append(int(ind))
        pages_obj_no = []
        top_pages_obj_no = []
        for ind in inds:
            if ind not in pages_obj_no and ind not in top_pages_obj_no:
                if fnd(pdf, bytes(f"\r{ind} 0 obj", "utf-8")) == -1:
                    top_pages_obj_no.append(ind)
                else:
                    pages_obj_no.append(ind)
        single_pages_obj_missed = len(top_pages_obj_no) == 1
        multi_pages_obj_missed = len(top_pages_obj_no) > 1
        catalog_obj_no = fnd_unuse_no(obj_no, top_pages_obj_no)
        obj_no.append(catalog_obj_no)
        root_pages_obj_no = None
        if multi_pages_obj_missed:
            root_pages_obj_no = fnd_unuse_no(obj_no, top_pages_obj_no)
        elif single_pages_obj_missed:
            root_pages_obj_no = top_pages_obj_no[0]
            top_pages_obj_no = pages_obj_no
        else:
            found = False
            for pon in pages_obj_no:
                tmp_addr = fnd(pdf, bytes(f"\r{pon} 0 obj", "utf-8"))
                while True:
                    pdf.seek(tmp_addr)
                    [_str] = struct.unpack("6s", pdf.read(6))
                    if _str == b"Parent":
                        break
                    if _str == b"endobj":
                        root_pages_obj_no = pon
                        found = True
                        break
                    tmp_addr = tmp_addr + 1
                if found:
                    break
        catalog = bytes(
            f"{catalog_obj_no} 0 obj\r<</Type /Catalog\r/Pages {root_pages_obj_no} 0 R\r>>\rendobj\r",
            "utf-8",
        )
        pdf_data += catalog
        pdf.close()
        with open("pdf.tmp", "wb") as f:
            f.write(pdf_data)
        pdf = open("pdf.tmp", "rb")

        if single_pages_obj_missed or multi_pages_obj_missed:
            inds_str = [f"{i} 0 R" for i in top_pages_obj_no]
            kids_str = f"[{' '.join(inds_str)}]"
            pages_str = (
                f"{root_pages_obj_no} 0 obj\r<<\r/Type /Pages\r/Kids {kids_str}\r/Count {self.page_num}\r>>\rendobj\r"
            )
            pdf_data += bytes(pages_str, "utf-8")
            pdf.close()
            with open("pdf.tmp", "wb") as f:
                f.write(pdf_data)

        pdf_data += b"\n%%EOF\r"
        with open("pdf.tmp", "wb") as f:
            f.write(pdf_data)

        mutool = resolve_mutool_executable()
        try:
            check_output([mutool, "clean", "pdf.tmp", "pdf_toc.pdf"], stderr=STDOUT)
        except CalledProcessError as e:
            print(e.output.decode("utf-8", errors="ignore"))
            raise SystemExit("Command mutool returned non-zero exit status " + str(e.returncode))

        try:
            add_outlines(self.get_toc(), "pdf_toc.pdf", dest)
        except Exception as error:
            print(f"Outline injection skipped: {error}")
            copy("pdf_toc.pdf", dest)
        os.remove("pdf.tmp")
        os.remove("pdf_toc.pdf")

    def _convert_pdf(self, dest):
        copy(self.filename, dest)

    def _convert_kdh(self, dest):
        fp = open(self.filename, "rb")
        origin = fp.read()
        fp.close()
        origin = origin[254:]
        output = []
        keycursor = 0
        for origin_byte in origin:
            output.append(origin_byte ^ KDH_PASSPHRASE[keycursor])
            keycursor += 1
            if keycursor >= len(KDH_PASSPHRASE):
                keycursor = 0
        output = bytes(output)
        eofpos = output.rfind(b"%%EOF")
        if eofpos < 0:
            raise Exception("%%EOF mark can't be found.")
        output = output[: eofpos + 5]
        fp = open(dest + ".tmp", "wb")
        fp.write(output)
        fp.close()
        mutool = resolve_mutool_executable()
        try:
            check_output([mutool, "clean", dest + ".tmp", dest], stderr=STDOUT)
        except CalledProcessError as e:
            print(e.output.decode("utf-8", errors="ignore"))
            raise SystemExit("Command mutool returned non-zero exit status " + str(e.returncode))
        os.remove(dest + ".tmp")


def resolve_mutool_executable():
    explicit = os.getenv("CAJ2PDF_MUTOOL_PATH")
    if explicit and Path(explicit).exists():
        return explicit
    found = shutil.which("mutool")
    if found:
        return found
    winget_path = Path.home() / "AppData/Local/Microsoft/WinGet/Packages/ArtifexSoftware.mutool_Microsoft.Winget.Source_8wekyb3d8bbwe/mupdf-1.23.0-windows/mutool.exe"
    if winget_path.exists():
        return str(winget_path)
    raise FileNotFoundError("mutool executable not found")
