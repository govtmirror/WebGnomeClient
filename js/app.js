// basic controller to configure and setup the app
define([
    'jquery',
    'underscore',
    'backbone',
    'router',
], function($, _, Backbone, Router) {
    "use strict";
    var app = {
        api: 'http://0.0.0.0:9899',
        initialize: function(){
            // Ask jQuery to add a cache-buster to AJAX requests, so that
            // IE's aggressive caching doesn't break everything.
            $.ajaxSetup({
                cache: false,
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });

            // Filter json requestions to redirect them to the api server
            $.ajaxPrefilter('json', function(options){
                options.url = webgnome.api + options.url;
            });

            // Use Django-style templates semantics with Underscore's _.template.
            _.templateSettings = {
                // {{- variable_name }} -- Escapes unsafe output (e.g. user
                // input) for security.
                escape: /\{\{-(.+?)\}\}/g,

                // {{ variable_name }} -- Does not escape output.
                interpolate: /\{\{(.+?)\}\}/g,

                // {{ javascript }}
                evaluate: /\{\%(.+?)\%\}/g
            };

            Backbone.View.prototype.close = function(){
                this.remove();
                this.unbind();
                if (this.onClose){
                    this.onClose();
                }
            };

            Backbone.Model.prototype.close = function(){
                this.clear();
                this.unbind();
                if (this.onClose){
                    this.onClose();
                }
            };

            Backbone.Model.prototype.parse = function(response){
                for(var key in this.model){
                    var embeddedClass = this.model[key];
                    var embeddedData = response[key];
                    response[key] = new embeddedClass(embeddedData, {parse:true});
                }
                return response;
            };


            this.router = new Router();
            Backbone.history.start();
        },
        hasModel: function(){
            return false;
        },
        
        validModel: function(){
            return false;
        }
    };

    return app;
});