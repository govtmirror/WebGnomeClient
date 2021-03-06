define([
    'jquery',
    'underscore',
    'backbone',
    'ol',
    'views/default/map',
    'model/location',
    'model/gnome',
    'sweetalert',
    'text!templates/location/index.html',
    'text!templates/location/list.html',
    'views/wizard/location'
], function($, _, Backbone, ol, OlMapView, GnomeLocation, GnomeModel, swal, LocationsTemplate, ListTemplate, LocationWizard){
    'use strict';
    var locationsView = Backbone.View.extend({
        className: 'page locations',
        mapView: null,
        popup: null,

        events: {
            'click .item': 'highlightLoc',
            'click .item a': 'setupLocation'
        },

        /**
         * @todo decomp the popover into a new view? How else to get load click event?
         */
        initialize: function(options){
            if (!_.isUndefined(options) && _.has(options, 'dom_target')) {
                this.dom_target = options.dom_target;
            } else {
                this.dom_target = 'body';
            }

            this.mapView = new OlMapView({
                controls: [],
                id: 'locations-map',
                layers: [
                    new ol.layer.Tile({
                        source: new ol.source.MapQuest({layer: 'osm'})
                    })
                ]
            });
            this.render();
            $.ajax(webgnome.config.api + '/location').success(_.bind(this.ajax_render, this)).error(function(){
                console.log('Error retrieving location files.');
            });
        },

        clickPin: function(feature){
            this.popup.setPosition(feature.getGeometry().getCoordinates());
            var content = '<button class="btn btn-primary setup btn-block" data-slug="' + feature.get('slug') + '" data-name="' + feature.get('title') + '">Load Location</button>';
            this.$('.popup').popover({
                placement: 'top',
                html: true,
                title: feature.get('title'),
                content: content
            });
            this.$('.popup').popover('show');

            this.$('.popup').one('shown.bs.popover', _.bind(function(){

                this.$('.load').on('click', _.bind(function(){
                    var slug = this.$('.load').data('slug');
                    var name = this.$('.load').data('name');
                    webgnome.model.resetLocation(_.bind(function(){
                        this.load({slug: slug, name: name});
                        this.$('.popup').popover('destroy');
                    }, this));
                }, this));

                this.$('.setup').on('click', _.bind(this.setupLocation, this));
            }, this));

            this.$('.popup').one('hide.bs.popover', _.bind(function(){
                this.$('.load').off('click');
                this.$('.setup').off('click');
            }, this));
        },

        dblClickPin: function(feature) {
            var slug = feature.get('slug');
            var name = feature.get('title');

            this.$('.popup').popover('destroy');
            this.setupLocation(null, {slug: slug, name: name});
        },

        hoverTooltip: function(feature) {
            this.tooltip.setPosition(feature.getGeometry().getCoordinates());
            var element = this.tooltip.getElement();
            if (this.$('.tooltip').length !== 0) {
                this.$('.tooltip-inner').text(feature.get('title'));
            } else {
                this.$(element).attr('data-toggle', 'tooltip');
                this.$(element).attr('data-placement', 'right');
                this.$(element).attr('title', feature.get('title'));
                this.$(element).tooltip('show');
            }
        },

        setupLocation: function(e, options){
            var slug, name;
            if (!_.isNull(e)){
                e.stopPropagation();
                slug = $(e.target).data('slug');
                name = $(e.target).data('name');
            } else {
                slug = options.slug;
                name = options.name;
            }
            webgnome.model = new GnomeModel();
            if(_.has(webgnome, 'cache')){
                webgnome.cache.rewind();
            }
            webgnome.model.save(null, {
                validate: false,
                success: _.bind(function(){
                    this.wizard({slug: slug, name: name});
                    this.$('.popup').popover('destroy');
                }, this)
            });
        },

        load: function(options){
            this.loading = true;
            this.trigger('load');
            var locationModel = new GnomeLocation({id: options.slug});
            locationModel.fetch({
                success: _.bind(function(){
                    webgnome.model.fetch({
                        success: _.bind(function(){
                            this.trigger('loaded');
                            this.loading = false;
                            webgnome.router.navigate('config', true);
                        }, this)
                    });
                }, this)
            });
        },

        wizard: function(options){
            this.trigger('load');
            this.wizard_ = new LocationWizard(options);
        },

        render: function(){
            var compiled = _.template(LocationsTemplate);
            $(this.dom_target).append(this.$el.html(compiled));

            this.mapView.render();
            this.popup = new ol.Overlay({
                position: 'bottom-center',
                element: this.$('.popup')[0],
                stopEvent: true,
                offsetX: -2,
                offsetY: -22
            });
            this.tooltip = new ol.Overlay({
                position: 'bottom-center',
                element: this.$('.tooltip-hover')[0],
                stopEvent: false,
                offsetX: 0,
                offsetY: -22
            });
            this.mapView.map.addOverlay(this.popup);
            this.mapView.map.addOverlay(this.tooltip);
            this.registerMapEvents();
        },

        ajax_render: function(geojson){
             this.layer = new ol.layer.Vector({
                source: new ol.source.Vector({
                    features: (new ol.format.GeoJSON()).readFeatures(geojson,  {featureProjection: 'EPSG:3857'}),
                    wrapX: false
                }),
                style: new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 1.0],
                        src: '/img/map-pin.png',
                        size: [32, 40]
                    })
                })
            });
            this.features = this.layer.getSource().getFeatures();

            this.mapView.map.addLayer(this.layer);

            var sortedLocations = geojson.features.sort(function(a, b) {
                var textA = a.properties.title.toUpperCase();
                var textB = b.properties.title.toUpperCase();
                return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
            });

            var list = _.template(ListTemplate, {
                locations: sortedLocations
            });
            this.$('.location-list').append(list);

        },

        registerMapEvents: function(){
            // change mouse to pointer when hovering over a feature.

            this.mapView.map.on('pointermove', _.bind(function(e){
                var pointer = this.mapView.map.forEachFeatureAtPixel(e.pixel, function(feature){
                    return true;
                });
                if(pointer){
                    this.mapView.map.getViewport().style.cursor = 'pointer';
                } else {
                    this.mapView.map.getViewport().style.cursor = '';
                }
                this.mapHoverEvent(e);
            }, this));

            // clicking a location creates a popover with it's related information displayed
            this.mapView.map.on('click', this.mapClickEvent, this);
            this.mapView.map.on('dblclick', this.mapDblClickEvent, this);
        },

        findFeature: function(slug) {
            return _.find(this.features, function(el) { return el.get('slug') === slug; });
        },

        highlightLoc: function(e){
            var loc = e.currentTarget;
            var coords = $(loc).data('coords').split(',');
            coords = ol.proj.transform([parseFloat(coords[0]), parseFloat(coords[1])], 'EPSG:4326', 'EPSG:3857');
            this.mapView.map.getView().setCenter(coords);
            this.mapView.map.getView().setZoom(24);

            var slug = $(loc).children().data('slug');
            var feature = this.findFeature(slug);

            setTimeout(_.bind(function(){
                e.pixel = this.mapView.map.getPixelFromCoordinate(coords);
                this.mapClickEvent(e, feature);
            }, this), 200);
        },

        mapHoverEvent: function(e) {
            var feature = this.mapView.map.forEachFeatureAtPixel(e.pixel, function(feature){
                return feature;
            });
            if (feature){
                if (this.$('.tooltip').length === 0) {
                    this.hoverTooltip(feature);
                } else {
                    this.$('.tooltip-hover').one('hidden.bs.tooltip', _.bind(function(){
                    setTimeout(_.bind(function(){
                        this.hoverTooltip(feature);
                        }, this), 1);
                    }, this));
                    this.$('.tooltip-hover').tooltip('destroy');
                }
            } else {
                this.$('.tooltip-hover').tooltip('destroy');
            }
        },

        mapClickEvent: function(e, feature_param){
            var feature;
            if (_.isUndefined(feature_param)) {
                feature = this.mapView.map.forEachFeatureAtPixel(e.pixel, function(feature){
                    return feature;
                });
            } else {
                feature = feature_param;
            }

            if(feature){
                if(this.$('.popover').length === 0){
                    this.clickPin(feature);
                } else {
                    this.$('.popup').one('hidden.bs.popover', _.bind(function(){
                        setTimeout(_.bind(function(){
                            this.clickPin(feature);
                        }, this), 1);
                    }, this));
                    this.$('.popup').popover('destroy');
                }
            } else {
                this.$('.popup').popover('destroy');
            }
        },

        mapDblClickEvent: function(e) {
            var feature = this.mapView.map.forEachFeatureAtPixel(e.pixel, function(feature){
                return feature;
            });

            if (feature && ($('.loading').length === 0 && $('.modal').length === 0)) {
                this.dblClickPin(feature);
            }
        },

        close: function(){
            this.mapView.close();
            Backbone.View.prototype.close.call(this);
        }
    });

    return locationsView;
});
