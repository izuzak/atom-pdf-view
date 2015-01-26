{$, TextEditorView, View} = require 'atom-space-pen-views'
{Disposable, CompositeDisposable} = require 'atom'

module.exports =
class PdfGoToPageView extends View
  @content: ->
    @div class: 'go-to-page', =>
      @subview 'miniEditor', new TextEditorView(mini: true)
      @div class: 'message', outlet: 'message'

  detaching: false

  initialize: ->
    atom.commands.add 'atom-workspace',
      'pdf-view:go-to-page': =>
        @toggle()
        false

    @miniEditor.on 'blur', => @close()

    atom.commands.add this.element,
      'core:confirm': =>
        @confirm()
      'core:cancel': =>
        @close()

    @miniEditor.preempt 'textInput', (e) =>
      false unless e.originalEvent.data.match(/[0-9]/)

  toggle: ->
    if @panel?.isVisible()
      @close()
    else
      @attach()

  close: ->
    @miniEditor.setText('')
    @panel?.hide()
    atom.workspace.getActivePane().activate()

  confirm: ->
    pageNumber = @miniEditor.getText()
    pageNumber = parseInt(pageNumber, 10)
    pdfView = atom.workspace.getActivePaneItem()

    @close()

    if pdfView and pdfView.pdfDocument and pdfView.scrollToPage
      pdfView.scrollToPage(pageNumber)

  attach: ->
    pdfView = atom.workspace.getActivePaneItem()

    if pdfView and pdfView.pdfDocument and pdfView.scrollToPage
      @panel = atom.workspace.addModalPanel(item: this)
      @message.text("Enter a page number 1-#{pdfView.getTotalPageNumber()}")
      @miniEditor.focus()
