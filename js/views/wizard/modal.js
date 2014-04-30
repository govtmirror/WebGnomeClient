define([
    'jquery',
    'underscore',
    'backbone',
    'views/modal/base',
    'lib/text!templates/default/alert-danger.html'
], function($, _, Backbone, BaseModal, AlertDangerTemplate){
    wizardModal = BaseModal.extend({
        className: 'modal fade new-wizard',

        initialize: function(options){
            if(options.body){
                this.body = options.body;
            }

            this.render();
        },

        events: {
            'click .next': 'next',
            'click .back': 'back',
            'hidden.bs.modal': 'close',
            'shown.bs.modal': 'ready',
            'click .modal-header>.close': 'wizardclose',
            'click .cancel': 'wizardclose',
            'change input': 'update',
            'keyup input': 'update'
        },

        ready: function() {
            this.trigger('ready');
        },

        next: function() {
            if(this.isValid()){
                this.hide();
                this.trigger('next');
            }
        },

        back: function() {
            this.hide();
            this.trigger('back');
        },

        error: function(strong, message) {
            this.$('.modal-body .alert').remove();
            this.$('.modal-body').prepend(_.template(AlertDangerTemplate, {strong: strong, message: message}));
        },

        clearError: function() {
            this.$('.modal-body .alert').remove();
        },

        isValid: function() {
            if (_.isFunction(this.validate)){
                var valid = this.validate();
                if (_.isUndefined(valid)) {
                    this.validationError = null;
                    return true;
                }
                this.validationError = valid;
                return false;
            } else {
                return true;
            }
        },

        validate: function() {
            if (!_.isUndefined(this.model)) {
                if (this.model.isValid()) {
                    return;
                }
                return this.model.validationError;
            }
        },

        wizardclose: function(){
            this.trigger('wizardclose');
        },

        close: function(){
            this.remove();
            this.unbind();
        }
    });

    return wizardModal;
});