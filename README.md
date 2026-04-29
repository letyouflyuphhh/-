# 插件

This repository bundles two local plugin projects:

- `CAJ to PDF`
- `ChatGPT Obsidian Bridge`

## Projects

### CAJ to PDF

Browser-extension workflow for converting local `.caj` files into `.pdf` through a local helper service.

Contents:

- `extension/` for the browser UI
- `helper/` for the local conversion server
- vendored conversion dependencies

Verified locally in this session:

- helper health endpoint responds on `127.0.0.1:27183`
- invalid non-`.caj` uploads are rejected correctly

### ChatGPT Obsidian Bridge

Chrome extension plus Obsidian plugin for selectively importing the currently open ChatGPT conversation into Obsidian.

Contents:

- `chrome-extension/`
- `obsidian-plugin/`

Verified locally in this session:

- Chrome extension build passes
- Obsidian plugin build passes
- import document preparation supports:
  - update main conversation note
  - import selected messages as a separate note
  - split one conversation into multiple notes

## Notes

- This repository intentionally excludes heavy local runtime folders such as `node_modules/` and Python virtual environments.
- Each subproject keeps its own README with project-specific setup and usage details.
