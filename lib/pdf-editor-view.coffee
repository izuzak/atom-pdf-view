{$, ScrollView} = require 'atom-space-pen-views'
{Point, TextEditor} = require 'atom'
fs = require 'fs-plus'
path = require 'path'
require './../node_modules/pdfjs-dist/build/pdf.js'
_ = require 'underscore-plus'
{File, Disposable, CompositeDisposable} = require 'atom'

PDFJS.workerSrc = "file://" + path.resolve(__dirname, "../node_modules/pdfjs-dist/build/pdf.worker.js")

{exec} = require 'child_process'

module.exports =
class PdfEditorView extends ScrollView
  @content: ->
    @div class: 'pdf-view', tabindex: -1, =>
      @div outlet: 'container'

  initialize: (filePath) ->
    super

    @currentScale = 1.5
    @defaultScale = 1.5
    @scaleFactor = 10.0

    @filePath = filePath
    @file = new File(@filePath)
    @canvases = []

    @updatePdf()

    @currentPageNumber = 0
    @totalPageNumber = 0
    @centersBetweenPages = []
    @pageHeights = []
    @scrollTopBeforeUpdate = 0
    @scrollLeftBeforeUpdate = 0
    @updating = false

    disposables = new CompositeDisposable

    onFileChangeCallback =
      _.debounce =>
        if @updating
          @fileChanged = true
        else
          @updatePdf()
      , 100

    disposables.add @file.onDidChange onFileChangeCallback

    moveLeftCallback = => @scrollLeft(@scrollLeft() - $(window).width() / 20)
    moveRightCallback = => @scrollRight(@scrollRight() + $(window).width() / 20)
    scrollCallback = => @onScroll()
    resizeHandler = => @setCurrentPageNumber()

    elem = this

    atom.commands.add '.pdf-view',
      'core:move-left': moveLeftCallback

    atom.commands.add '.pdf-view',
      'core:move-right': moveRightCallback

    elem.on 'scroll', scrollCallback
    disposables.add new Disposable ->
      $(window).off 'scroll', scrollCallback

    $(window).on 'resize', resizeHandler
    disposables.add new Disposable ->
      $(window).off 'resize', resizeHandler

    atom.commands.add 'atom-workspace',
      'pdf-view:zoom-in': => @zoomIn()
      'pdf-view:zoom-out': => @zoomOut()
      'pdf-view:reset-zoom': => @resetZoom()

    @dragging = null

    @on 'mousedown', (e) =>
      @dragging = x: e.screenX, y: e.screenY, scrollTop: @scrollTop(), scrollLeft: @scrollLeft()
      @simpleClick = true

    @on 'mousemove', (e) =>
      if @dragging
        @simpleClick = false

        @scrollTop @dragging.scrollTop - (e.screenY - @dragging.y)
        @scrollLeft @dragging.scrollLeft - (e.screenX - @dragging.x)
        e.preventDefault()

    @on 'mouseup', (e) =>
      @dragging = null

    @on 'mouseleave', (e) =>
      if @dragging
        @dragging = null

    @on 'mousewheel', (e) =>
      if e.ctrlKey
        e.preventDefault
        if e.originalEvent.wheelDelta > 0
          @zoomIn()
        else if e.originalEvent.wheelDelta < 0
          @zoomOut()

  onCanvasClick: (page, e) ->
    if @simpleClick
      e.preventDefault()
      @pdfDocument.getPage(page).then (pdfPage) =>
        viewport = pdfPage.getViewport(@currentScale)
        [x,y] = viewport.convertToPdfPoint(e.offsetX, $(@canvases[page-1]).height()-e.offsetY)
        cmd = "synctex edit -o " + page + ":" + x + ":" + y + ":" + @filePath
        exec cmd,
          (error, stdout, stderr) =>
            if not error
              attrs = {}
              for line in stdout.split('\n')
                m = line.match /^([a-zA-Z]*):(.*)$/
                if m
                  attrs[m[1]] = m[2]
              file = attrs.Input
              line = attrs.Line
              if file && line
                editor = null
                pathToOpen = path.normalize(attrs.Input)
                lineToOpen = +attrs.Line
                done = false
                for pane in atom.workspace.getPanes()
                  for editor in pane.getItems()
                    if editor instanceof TextEditor
                      if editor.getPath() == pathToOpen
                        position = new Point(lineToOpen, -1)
                        editor.scrollToBufferPosition(position, center: true)
                        editor.setCursorBufferPosition(position)
                        editor.moveToFirstCharacterOfLine()
                        pane.activateItem(editor)
                        pane.activate()
                        done = true
                if not done
                  atom.workspace.open pathToOpen,
                    initialLine: lineToOpen,
                    initialColumn: 0

  onScroll: ->
    if not @updating
      @scrollTopBeforeUpdate = @scrollTop()
      @scrollLeftBeforeUpdate = @scrollLeft()

    @setCurrentPageNumber()

  setCurrentPageNumber: ->
    if not @pdfDocument
      return

    center = (@scrollBottom() + @scrollTop())/2.0
    @currentPageNumber = 1

    if @centersBetweenPages.length == 0 && @pageHeights.length == @pdfDocument.numPages
      for pdfPageNumber in [1..@pdfDocument.numPages]
        @centersBetweenPages.push((@pageHeights[0..(pdfPageNumber-1)].reduce ((x,y) -> x + y), 0) + pdfPageNumber * 20 - 10)

    for pdfPageNumber in [2..@pdfDocument.numPages]
      if center >= @centersBetweenPages[pdfPageNumber-2] && center < @centersBetweenPages[pdfPageNumber-1]
        @currentPageNumber = pdfPageNumber

    atom.views.getView(atom.workspace).dispatchEvent(new Event('pdf-view:current-page-update'));

  finishUpdate: ->
    @updating = false
    if @fileChanged
      @updatePdf()

  updatePdf: ->
    @fileChanged = false

    return unless fs.existsSync(@filePath)

    try
      pdfData = new Uint8Array(fs.readFileSync(@filePath))
    catch error
      return if error.code is 'ENOENT'

    @updating = true
    @container.find("canvas").remove()
    @canvases = []

    PDFJS.getDocument(pdfData).then (pdfDocument) =>
      @pdfDocument = pdfDocument
      @totalPageNumber = @pdfDocument.numPages

      for pdfPageNumber in [1..@pdfDocument.numPages]
        canvas = $("<canvas/>", class: "page-container").appendTo(@container)[0]
        @canvases.push(canvas)
        do (pdfPageNumber) => $(canvas).on 'click', (e) => @onCanvasClick(pdfPageNumber, e)

      @renderPdf()
    , => @finishUpdate()

  renderPdf: (scrollAfterRender = true) ->
    @centersBetweenPages = []
    @pageHeights = []

    for pdfPageNumber in [1..@pdfDocument.numPages]
      canvas = @canvases[pdfPageNumber-1]

      do (canvas) =>
        @pdfDocument.getPage(pdfPageNumber).then (pdfPage) =>
          viewport = pdfPage.getViewport(@currentScale)
          context = canvas.getContext('2d')

          outputScale = window.devicePixelRatio
          canvas.height = Math.floor(viewport.height) * outputScale
          canvas.width = Math.floor(viewport.width) * outputScale

          if outputScale isnt 1
            context._scaleX = outputScale
            context._scaleY = outputScale
            context.scale outputScale, outputScale
            canvas.style.width = Math.floor(viewport.width) + 'px';
            canvas.style.height = Math.floor(viewport.height) + 'px';

          @pageHeights.push(Math.floor(viewport.height))

          pdfPage.render({canvasContext: context, viewport: viewport})

          if pdfPage.pageNumber == @pdfDocument.numPages and scrollAfterRender
            @scrollTop(@scrollTopBeforeUpdate)
            @scrollLeft(@scrollLeftBeforeUpdate)
            @setCurrentPageNumber()
            @finishUpdate()
        , => @finishUpdate()

  zoomOut: ->
    @adjustSize(100 / (100 + @scaleFactor))

  zoomIn: ->
    @adjustSize((100 + @scaleFactor) / 100)

  resetZoom: ->
    @adjustSize(@defaultScale / @currentScale)

  computeZoomedScrollTop: (oldScrollTop, oldPageHeights) ->
    pixelsToZoom = 0
    spacesToSkip = 0
    zoomedPixels = 0

    for pdfPageNumber in [0...@pdfDocument.numPages]
      if pixelsToZoom + spacesToSkip + oldPageHeights[pdfPageNumber] > oldScrollTop
        zoomFactorForPage = @pageHeights[pdfPageNumber] / oldPageHeights[pdfPageNumber]
        partOfPageAboveUpperBorder = oldScrollTop - (pixelsToZoom + spacesToSkip)
        zoomedPixels += Math.round(partOfPageAboveUpperBorder * zoomFactorForPage)
        pixelsToZoom += partOfPageAboveUpperBorder
        break
      else
        pixelsToZoom += oldPageHeights[pdfPageNumber]
        zoomedPixels += @pageHeights[pdfPageNumber]

      if pixelsToZoom + spacesToSkip + 20 > oldScrollTop
        partOfPaddingAboveUpperBorder = oldScrollTop - (pixelsToZoom + spacesToSkip)
        spacesToSkip += partOfPaddingAboveUpperBorder
        break
      else
        spacesToSkip += 20

    return zoomedPixels + spacesToSkip

  adjustSize: (factor) ->
    oldScrollTop = @scrollTop()
    oldPageHeights = @pageHeights.slice(0)
    @currentScale = @currentScale * factor
    @renderPdf(false)

    process.nextTick =>
      newScrollTop = @computeZoomedScrollTop(oldScrollTop, oldPageHeights)
      @scrollTop(newScrollTop)

    process.nextTick =>
      newScrollLeft = @scrollLeft() * factor
      @scrollLeft(newScrollLeft)

  getCurrentPageNumber: () ->
    return @currentPageNumber

  getTotalPageNumber: () ->
    return @totalPageNumber

  scrollToPage: (pdfPageNumber) ->
    if not @pdfDocument or isNaN(pdfPageNumber)
      return

    pdfPageNumber = @pdfDocument.numPages unless pdfPageNumber < @pdfDocument.numPages
    pageScrollPosition = (@pageHeights[0...(pdfPageNumber-1)].reduce ((x,y) -> x + y), 0) + (pdfPageNumber - 1) * 20

    @scrollTop(pageScrollPosition)

  serialize: ->
    {@filePath, deserializer: 'PdfEditorDeserializer'}

  getTitle: ->
    if @filePath?
      path.basename(@filePath)
    else
      'untitled'

  getURI: ->
    @filePath

  getPath: ->
    @filePath

  destroy: ->
    @detach()

  onDidChangeTitle: ->
    return new Disposable -> null

  onDidChangeModified: ->
    return new Disposable -> null
