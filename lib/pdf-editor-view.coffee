{$, ScrollView} = require 'atom'
fs = require 'fs-plus'
path = require 'path'
require './../node_modules/pdf.js/build/singlefile/build/pdf.combined.js'
{File} = require 'pathwatcher'

module.exports =
class PdfEditorView extends ScrollView
  atom.deserializers.add(this)

  @deserialize: ({filePath}) ->
    if fs.isFileSync(filePath)
      new PdfEditorView(filePath)
    else
      console.warn "Could not deserialize PDF editor for path '#{filePath}' because that file no longer exists"

  @content: ->
    @div class: 'pdf-view', tabindex: -1, =>
      @div outlet: 'container'

  initialize: (path) ->
    super

    @filePath = path
    @file = new File(@filePath)

    @renderPdf()

    @subscribe @file, 'contents-changed', => @renderPdf()
    @subscribe this, 'core:move-up', => @scrollUp()
    @subscribe this, 'core:move-down', => @scrollDown()

  renderPdf: ->
    pdfData = new Uint8Array(fs.readFileSync(@filePath));

    $("canvas").remove()

    PDFJS.getDocument(pdfData).then (pdfDocument) =>
      for pdfPageNumber in [1..pdfDocument.numPages]
        canvas = $("<canvas/>", class: "page-container").appendTo(@container)[0]

        do (canvas) ->
          pdfDocument.getPage(pdfPageNumber).then (pdfPage) ->
            scale = 1.5;
            viewport = pdfPage.getViewport(scale);
            context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            pdfPage.render({canvasContext: context, viewport: viewport})

  serialize: ->
    {@filePath, deserializer: 'PdfEditorView'}

  getTitle: ->
    if @filePath?
      path.basename(@filePath)
    else
      'untitled'

  getUri: ->
    @filePath

  getPath: ->
    @filePath

  destroy: ->
    @detach()
