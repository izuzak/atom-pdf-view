"use babel";

var PdfEditorView = null;

export default ({filePath}) => {
  if (require('fs-plus').isFileSync(filePath)) {
    if (PdfEditorView === null) {
      PdfEditorView = require('./pdf-editor-view');
    }
    return new PdfEditorView(filePath);
  } else {
    console.warn("Could not deserialize PDF editor for path '#{filePath}' because that file no longer exists");
  }
}
