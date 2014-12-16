define([
    'jquery',
    'underscore',
    'backbone',
    'model/help/help',
    'model/help/feedback',
    'text!templates/default/help.html',
    'text!templates/default/help-tab.html'
], function($, _, Backbone, HelpModel, FeedbackModel, HelpTemplate, HelpTabTemplate){
    var helpView = Backbone.View.extend({
        className: 'help-content',
        ready: false,

        events: {
            'click .helpful a': 'logHelpful',
            'click .send': 'logResponse'
        },

        initialize: function(options){
            if (_.has(options, 'path')){
                this.help = new HelpModel({id: options.path});
                this.help.fetch({
                    success: _.bind(function(){
                        this.ready = true;
                        this.render();
                        this.trigger('ready');
                    }, this)
                });
            }
        },

        render: function(){
            var compiled;
            if($('<div>' + this.help.get('html') + '</div>').find('.document').length <= 1){
                compiled = _.template(HelpTemplate, {
                    html: this.help.get('html')
                });
                this.$el.addClass('alert alert-info alert-dismissable');
            } else {
                tabs = this.getTabs(this.help.get('html'));
                html = $('<div>' + this.help.get('html') + '</div>');
                html.find('h1').remove();
                html.find('.document:first').addClass('active');
                html.find('.document').addClass('tab-pane');
                compiled = _.template(HelpTabTemplate, {
                    tabs: tabs,
                    html: html.html()
                });
            }
            this.$el.append(compiled);
        },

        logHelpful: function(e){
            var target;
            if (e.target.nodeName === 'SPAN'){
                target = e.target.parentElement;
            } else {
                target = e.target;
            }

            var ishelpful = target.dataset.helpful;

            this.$('.helpful a').removeClass('selected');
            this.$(target).addClass('selected');

            this.help.set('helpful', ishelpful);
            this.help.save(null, {
                success: _.bind(function(){
                    if(this.help.get('helpful') === 'false'){
                        this.showResponse();
                    }
                }, this)
            });
        },

        showResponse: function(){
            this.$('.response').show();
        },

        logResponse: function(){
            this.help.set('response', this.$('textarea').val());
            this.help.save(null, {
                success: _.bind(function(){
                    this.$('.helpful, .response').hide();
                    this.$('.thankyou').fadeIn();
                })
            });
        },

        getTabs: function(html){
            if(_.isUndefined(html)) return '';
            tabs = '';
            html = $(html);
            var headers = html.find('h1');
            headers.each(function(i, el){
                if(i === 0){
                    tabs += '<li class="active"><a href="#' + $(el).parent().attr('id') + '" data-toggle="tab">' + $(el).text() + '</a></li>';
                } else {
                    tabs += '<li><a href="#' + $(el).parent().attr('id') + '" data-toggle="tab">' + $(el).text() + '</a></li>';
                }
            });
            return tabs;
        }
    });

    return helpView;
});