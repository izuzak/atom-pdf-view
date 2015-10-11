path = null
PdfEditorView = null

module.exports =
  activate: (state) ->
    @opener = atom.workspace.addOpener openUri
    atom.packages.onDidActivateInitialPackages -> createPdfStatusView()

  deactivate: ->
    @opener.dispose()

  config:
    enableSyncTeX:
      type: "boolean"
      default: true
      title: "Enable SyncTeX"
      description: "A click on a PDF generated with the `--synctex=1` option will take you to the source."
    syncTeXPath:
      type: "string"
      default: ""
      title: "Path to synctex binary"
      description: "If not specified, look for `synctex` in `PATH`"

# Files with these extensions will be opened as PDFs
pdfExtensions = ['.pdf']
openUri = (uriToOpen) ->
  path ?= require 'path'
  uriExtension = path.extname(uriToOpen).toLowerCase()
  if uriExtension in pdfExtensions
    PdfEditorView ?= require './pdf-editor-view'
    new PdfEditorView(uriToOpen)

createPdfStatusView = ->
  PdfStatusBarView = require './pdf-status-bar-view'
  new PdfStatusBarView()
  PdfGoToPageView = require './pdf-goto-page-view.coffee'
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
