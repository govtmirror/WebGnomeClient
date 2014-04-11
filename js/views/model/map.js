define([
    'jquery',
    'underscore',
    'backbone',
    'lib/text!templates/model/controls.html',
    'lib/ol',
    'jqueryui'
], function($, _, Backbone, ControlsTemplate, ol){
    var mapView = Backbone.View.extend({
        className: 'map',
        id: 'map',
        full: false,
        width: '70%',

        initialize: function(){
            this.render();
            this.$('.seek > div').slider();
        },

        render: function(){
            var date = new Date();
            date = date.getMonth() + 1 + '/' + date.getDate() + '/' + date.getFullYear() + ' ' + date.getHours() + ':' + date.getMinutes() + ' ';
            var compiled = _.template(ControlsTemplate, {date: date});
            this.$el.html(compiled);
        },

        toggle: function(offset){
            offset = typeof offset !== 'undefined' ? offset : 0;

            if(this.full){
                this.full = false;
                this.$el.css({width: this.width, paddingLeft: 0});
            } else{
                this.full = true;
                this.$el.css({width: '100%', paddingLeft: offset});
            }
            webgnome.map.updateSize();
        },

        renderMap: function(){
            webgnome.map = new ol.Map({
                controls: ol.control.defaults().extend([
                    new ol.control.MeasureRuler()
                ]),
                target: 'map',
                layers: [
                    new ol.layer.Tile({
                        source: new ol.source.MapQuest({layer: 'osm'})
                    })
                ],
                view: new ol.View2D({
                    center: ol.proj.transform([-99.6, 40.6], 'EPSG:4326', 'EPSG:3857'),
                    zoom: 4
                })
            });
        },

        close: function(){
            this.remove();
            this.unbind();
            webgnome.map = {};
        }
    });

    return mapView;
});