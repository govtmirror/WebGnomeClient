define([
    'jquery',
    'underscore',
    'backbone'
], function($, _, Backbone){
    'use strict';
    var baseWizard = Backbone.View.extend({
        steps: [],
        step: 0,

        start: function(){
            this.steps[this.step].render();
            _.each(this.steps, this.register, this);
        },

        next: function(){
            if(this.steps[this.step].$el.is(':hidden')){
                this.next_();
            } else {
                this.next_();
            }
        },

        next_: function(){
            this.step++;
            if(this.steps[this.step].rendered_){
                this.steps[this.step].show();
            } else {
                this.steps[this.step].render();
            }
        },

        prev: function(){
            if(this.steps[this.step].$el.is(':hidden')){
                this.prev_();
            } else {
                this.prev_();
            }
        },

        prev_: function(){
            this.step--;
            if(this.steps[this.step].rendered_){
                this.steps[this.step].show();
            } else {
                this.steps[this.step].render();
            }
        },

        goto: function(step){
            this.step = step;
            if(this.steps[this.step].rendered_){
                this.steps[this.step].show();
            } else {
                this.steps[this.step].render();
            }
        },

        register: function(step){
            step.on('save', this.next, this);
            step.on('back', this.prev, this);
            step.on('wizardclose', this.close, this);
            step.on('finish', this.close, this);
        },

        wizardclose: function(){
            _.each(this.steps, function(el){
                el.on('hidden', el.close, el);
                el.hide();
            });
            this.unbind();
            this.remove();
        }
    });

    return baseWizard;
});