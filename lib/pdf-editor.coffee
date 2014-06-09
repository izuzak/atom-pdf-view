path = require 'path'
PdfEditorView = require './pdf-editor-view'
PdfStatusBarView = require  './pdf-status-bar-view'

module.exports =
  activate: (state) ->
    atom.workspace.registerOpener(openUri)
    atom.packages.once('activated', createPdfStatusView)

  deactivate: ->
    atom.workspace.unregisterOpener(openUri)

# Files with these extensions will be opened as PDFs
pdfExtensions = ['.pdf']
openUri = (uriToOpen) ->
  uriExtension = path.extname(uriToOpen).toLowerCase()
  if uriExtension in pdfExtensions
    new PdfEditorView(uriToOpen)

createPdfStatusView = ->
  {statusBar} = atom.workspaceView
  if statusBar?
    view = new PdfStatusBarView(statusBar)
    view.attach()
