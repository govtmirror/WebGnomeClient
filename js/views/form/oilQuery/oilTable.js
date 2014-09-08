define([
    'jquery',
    'underscore',
    'backbone',
    'model/resources/oilLib',
    'text!templates/default/oilTable.html',
], function($, _, Backbone, OilLib, OilTableTemplate){
    var oilTableView = Backbone.View.extend({
        id: 'tableContainer',
        ready: false,
        events: {
            'click th': 'headerClick',
            'click td': 'oilSelect',
            'click .backOil': 'goBack',
            'click .oilInfo': 'viewSpecificOil'
        },
        sortUpIcon: '&#9650;',
        sortDnIcon: '&#9660;',
        activeIcon: null,

        initialize: function(){
            this.oilLib = new OilLib();
            this.oilLib.on('ready', this.setReady, this);
            this.on('sort', this.sortTable);
        },

        setReady: function(){
            var compiled = _.template(OilTableTemplate, {data: this.oilLib});
            this.$el.html(compiled);
            this.appendCaret();
            this.ready = true;
            this.trigger('ready');
        },

        sortTable: function(){
            var compiled = _.template(OilTableTemplate, {data: this.oilLib});
            this.$el.html(compiled);
            this.appendCaret();
            this.trigger('renderTable');
        },

        appendCaret: function(){
             if (this.oilLib.sortDir === 1){
                this.activeIcon = this.sortUpIcon;
            } else {
                this.activeIcon = this.sortDnIcon;
            }
            this.$('.' + this.oilLib.sortAttr + ' span').html(this.activeIcon);
        },

        render: function(){
            var compiled = _.template(OilTableTemplate, {
                data: this.oilLib
            });
            $('#tableContainer').html(this.$el.html(compiled));
            this.trigger('sort');
        },

        headerClick: function(e){
            var ns = e.target.className,
                cs = this.oilLib.sortAttr;

            if (ns == cs){
                this.oilLib.sortDir *= -1;
            } else {
                this.oilLib.sortDir = 1;
            }

            $(e.currentTarget).closest('thead').find('span').empty();

            this.oilLib.sortOils(ns);
            this.trigger('sort');
        }

    });
    return oilTableView;
});