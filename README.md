# PDF View package

Adds support for viewing PDF files in Atom. Powered by [PDF.js](https://github.com/mozilla/pdf.js)

![](https://cloud.githubusercontent.com/assets/38924/2875460/79a8fc56-d41c-11e3-8f32-31f71a47e0fb.png)

## Features

### Zooming

|            | OSX                | Windows and Linux    |
|------------|--------------------|----------------------|
| Zoom in    | `cmd-=` or `cmd-+` | `ctrl-=` or `ctrl-+` |
| Zoom out   | `cmd--` or `cmd-_` | `ctrl--` or `ctrl-_` |
| Reset zoom | `cmd-0`            | `ctrl-0`             |

You can also zoom by holding `ctrl` and using the mouse wheel.

### Status bar information

Shows the number of the current page and total page count.

![](https://cloud.githubusercontent.com/assets/38924/3214330/a13c58a2-efac-11e3-85a5-c75f6d654058.png)

### Go to page

Jump to a specific page by either clicking on the page count in the status bar or by executing the `Pdf View: Go To Page` command from the command palette.

![](https://cloud.githubusercontent.com/assets/38924/3689767/ce223cce-1342-11e4-8b7b-b2e5bdbb3016.png)

### SyncTeX

For PDF files created by TeX using the `--synctex=1` option, a click on the PDF
will take you to the corresponding source code. If the `synctex` command (part
of modern TeX distributions) is in your PATH, this will work out of the box,
otherwise you can configure the path to the `synctex` binary in the settings.
