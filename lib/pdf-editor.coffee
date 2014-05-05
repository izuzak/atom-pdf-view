path = require 'path'
PdfEditorView = require './pdf-editor-view'

module.exports =
  activate: (state) ->
    atom.workspace.registerOpener(openUri)

  deactivate: ->
    atom.workspace.unregisterOpener(openUri)

# Files with these extensions will be opened as PDFs
pdfExtensions = ['.pdf']
openUri = (uriToOpen) ->
  uriExtension = path.extname(uriToOpen).toLowerCase()
  if uriExtension in pdfExtensions
    new PdfEditorView(uriToOpen)
