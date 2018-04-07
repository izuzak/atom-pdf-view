"use babel";

var path = null;
var PdfEditorView = null;
var querystring = null;

export const config = {
  reverseSyncBehaviour: {
    type: "string",
    enum: ['Disabled', 'Click', 'Double click'],
    'default': 'Click',
    title: "SyncTeX Reverse sync behaviour",
    description: "Specify the action on the PDF generated with the `--synctex=1` option that takes you to the source."
  },
  syncTeXPath: {
    type: "string",
    'default': "",
    title: "Path to synctex binary",
    description: "If not specified, look for `synctex` in `PATH`"
  },
  fitToWidthOnOpen: {
    type: "boolean",
    'default': false,
    title: "Fit to width on open",
    description: "When opening a document, fit it to the pane width"
  },
  paneToUseInSynctex: {
    type: "string",
    'enum' : ['default', 'left', 'right', 'up', 'down'],
    'default': 'default',
    title: "Pane to use when opening new tex files",
    description: "When using reverse sync and a new tex source file has to be opened, use the provided pane to open the new file. 'default' will use the pane of the PDF viewer."
  },
  autoReloadOnUpdate: {
    type: "boolean",
    'default': true,
    title: "Auto reload on update",
    description: "Auto reload when the file is updated"
  },
  nightMode: {
    type: "boolean",
    default: false,
    title: "Night Mode",
    description: "Inverts the colors of the pdf"
  }
}

export function activate(state) {
  this.subscription = atom.workspace.addOpener(openUri);
  atom.packages.onDidActivateInitialPackages(createPdfStatusView);
}

export function deactivate() {
  this.subscription.dispose();
}

export function handleURI(parsedUri) {
  const query = Object.assign({}, parsedUri.query)

  if (parsedUri.hash) {
    // Allow query parameters to exist in hash to main compatability with Adobe
    // PDF style urls.
    if (parsedUri.hash.includes('=')) {
      if (querystring === null) {
        querystring = require('querystring')
      }

      Object.assign(query, querystring.parse(parsedUri.hash.substring(1)))
    } else {
      query.nameddest = parsedUri.hash.substring(1)
    }
  }

  const filePath = query.path || pathnameToFilePath(parsedUri.pathname)

  atom.workspace.open(filePath).then(view => {
    if (view) {
      if (query.source && query.line) {
        view.forwardSync(query.source, query.line)
      } else if (query.page) {
        view.scrollToPage(query.page)
      } else if (query.nameddest) {
        view.scrollToNamedDest(query.nameddest)
      }
    }
  })
}

function pathnameToFilePath(pathname) {
  let filePath = decodeURI(pathname || '')

  if (process.platform === 'win32') {
    filePath = filePath.replace(/\//g, '\\').replace(/^(.+)\|/, '$1:').replace(/\\([A-Z]:\\)/, '$1')
  } else if (!filePath.startsWith('/')) {
    filePath = `/${filePath}`
  }

  return filePath
}

// Files with these extensions will be opened as PDFs
const pdfExtensions = new Set(['.pdf']);

function openUri(uriToOpen) {
  if (path === null) {
    path = require('path');
  }

  let uriExtension = path.extname(uriToOpen).toLowerCase()
  if (pdfExtensions.has(uriExtension)) {
    if (PdfEditorView === null) {
      PdfEditorView = require('./pdf-editor-view');
    }
    return new PdfEditorView(uriToOpen);
  }
}

function createPdfStatusView() {
  let PdfStatusBarView = require('./pdf-status-bar-view');
  new PdfStatusBarView();
  let PdfGoToPageView = require('./pdf-goto-page-view');
  new PdfGoToPageView();
}

export function deserialize({filePath, scale, scrollTop, scrollLeft}) {
  if (require('fs-plus').isFileSync(filePath)) {
    if (PdfEditorView === null) {
      PdfEditorView = require('./pdf-editor-view');
    }
    return new PdfEditorView(filePath, scale, scrollTop, scrollLeft);
  } else {
    console.warn("Could not deserialize PDF editor for path '#{filePath}' because that file no longer exists");
  }
}

if (parseFloat(atom.getVersion()) < 1.7) {
  atom.deserializers.add({
    "name": "PdfEditorDeserializer",
    "deserialize": deserialize
  });
}
