"use babel";

let path = null;
let PdfEditorView = null;
let querystring = null;
let subscriptions = null;
const {CompositeDisposable} = require('atom');

export function activate(state) {
  subscriptions = new CompositeDisposable(
    atom.workspace.addOpener(openUri),
    atom.packages.onDidActivateInitialPackages(createPdfStatusView),
    atom.config.observe('pdf-view.fileExtensions', updateFileExtensions),
    atom.commands.add('atom-workspace', 'pdf-view:toggle-binary-view', toggleBinaryView)
  );
}

export function deactivate() {
  if (subscriptions) {
    subscriptions.dispose();
  }
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
const pdfExtensions = new Set();

function updateFileExtensions(extensions) {
  pdfExtensions.clear();
  for (let extension of extensions) {
    extension = extension.toLowerCase().replace(/^\.*/, '.');
    pdfExtensions.add(extension);
  }
}

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

function toggleBinaryView() {
  if(PdfEditorView === null) {
    PdfEditorView = require('./pdf-editor-view');
  }
  const paneItem = atom.workspace.getActivePaneItem();
  if(!paneItem || !(paneItem instanceof PdfEditorView)) {
    return;
  }
  paneItem.binaryView = !paneItem.binaryView;
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
