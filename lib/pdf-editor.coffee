path = null
PdfEditorView = null

module.exports =
  activate: (state) ->
    @opener = atom.workspace.addOpener openUri
    atom.packages.once('activated', createPdfStatusView)

  deactivate: ->
    @opener.dispose()

# Files with these extensions will be opened as PDFs
pdfExtensions = ['.pdf']
openUri = (uriToOpen) ->
  path ?= require 'path'
  uriExtension = path.extname(uriToOpen).toLowerCase()
  if uriExtension in pdfExtensions
    PdfEditorView ?= require './pdf-editor-view'
    new PdfEditorView(uriToOpen)

createPdfStatusView = ->
  {statusBar} = atom.workspaceView
  if statusBar?
    PdfStatusBarView = require  './pdf-status-bar-view'
    view = new PdfStatusBarView(statusBar)
    view.attach()
  PdfGoToPageView = require  './pdf-goto-page-view.coffee'
  new PdfGoToPageView()

PdfEditorDeserializer =
  name: 'PdfEditorDeserializer'
  deserialize: ({filePath}) ->
    if require('fs-plus').isFileSync(filePath)
      PdfEditorView ?= require './pdf-editor-view'
      new PdfEditorView(filePath)
    else
      console.warn "Could not deserialize PDF editor for path '#{filePath}' because that file no longer exists"
atom.deserializers.add PdfEditorDeserializer
