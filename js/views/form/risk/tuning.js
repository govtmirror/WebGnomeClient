define([
    'jquery',
    'underscore',
    'backbone',
    'jqueryui/core',
    'views/modal/form',
    'text!templates/risk/tuning.html',
    'text!templates/risk/relativeimportance.html',
    'relativeimportance',
    'flot'
], function($, _, Backbone, jqueryui, FormModal, RiskTemplate, RelativeImportanceTemplate, RelativeImportance) {
    var riskForm = FormModal.extend({
        className: 'modal fade form-modal risk-form',
        name: 'risk',
        title: 'Environmental Risk Assessment Input',
        benefitGauge: null,
        self: null,

        events: function(){
            return _.defaults({}, FormModal.prototype.events);
        },

        initialize: function(options, model) {
            FormModal.prototype.initialize.call(this, options);
            this.model = (model ? model : null);
            self = this;
        },

        render: function(options){
            var showDispersant, showBurn, showSkimming;
            _.each(webgnome.model.get('weatherers').models, function(el, idx){
                if (el.attributes.obj_type === "gnome.weatherers.cleanup.Dispersion") {
                    if (el.attributes.name != "_natural") {
                        showDispersant = true;
                    }
                } else if (el.attributes.obj_type === "gnome.weatherers.cleanup.Burn") {
                    showBurn = true;
                } else if (el.attributes.obj_type === "gnome.weatherers.cleanup.Skimmer") {
                    showSkimming = true;
                }
            });

            this.body = _.template(RiskTemplate, {
                surface: this.model.get('surface').toFixed(3),
                column: this.model.get('column').toFixed(3),
                shoreline: this.model.get('shoreline').toFixed(3),
                showDispersant: showDispersant,
                showBurn: showBurn,
                showSkimming: showSkimming
            });

            FormModal.prototype.render.call(this, options);

            this.createSlider('.slider-skimming', this.model.get('efficiency').skimming);
            this.createSlider('.slider-dispersant', this.model.get('efficiency').dispersant);
            this.createSlider('.slider-in-situ-burn', this.model.get('efficiency').insitu_burn);

            this.relativeImp = new RelativeImportance('importance',
                {   sideLength: 150,
                    point1: {label: 'column'},
                    point2: {label: 'surface'},
                    point3: {label: 'shoreline'},
                    callback: _.bind(this.relativeImportancePercent, this)
                });

            this.relativeImp.draw();

            this.on('relativeRendered', _.bind(function(){this.renderPie(this.pieData);}, this));

            this.trigger('relativeRendered');
        },

        relativeImportancePercent: function(data){
            this.$('.relative-importance').html('');
            var relativeimportance = _.template(RelativeImportanceTemplate, {
                'data': data
            });
            this.$('.relative-importance').html(relativeimportance);
            this.pieData = data;
            this.trigger('relativeRendered');
        },

        formatPieData: function(data){
            var dataArray = [];

            for (var key in data){
                var obj = {
                    label: key,
                    'data': data[key].data,
                    color: data[key].color
                };
                dataArray.push(obj);
            }
            return dataArray;
        },

        renderPie: function(data){
            var plotData = this.formatPieData(data);
            $.plot('#pie-importance .chart', plotData, {
                series: {
                    pie: {
                        show: true,
                        radius: 3 / 4,
                        label: {
                            formatter: function(label, series){
                                return '<div><span style="background-color:' + series.color + ';"></span>' + label + '<br>' + Math.round(series.data[0][1]) + '%</div>';
                            },
                            show: true,
                            radius: 6 / 10
                        }
                    }
                },
                legend: {
                    show: false
                }
            });
            this.updateBenefit(this.pieData);
        },

        updateBenefit: function(data){
            var benefit = Math.round(data.column.data);
            this.$('google-chart').attr('data', '[["Label", "Value"], ["Benefit", ' + benefit + ']]');
        },

        createSlider: function(selector, value){
            this.$(selector).slider({
                    max: 100,
                    min: 0,
                    value: value,
                    create: _.bind(function(e, ui){
                           this.$(selector+' .ui-slider-handle').html('<div class="tooltip top slider-tip"><div class="tooltip-inner">' + value + '</div></div>');
                        }, this),
                    slide: _.bind(function(e, ui){
                           this.$(selector+' .ui-slider-handle').html('<div class="tooltip top slider-tip"><div class="tooltip-inner">' + ui.value + '</div></div>');
                        }, this),
                    stop: _.bind(function(e, ui){
                            this.reassessRisk();
                        }, this)
            });
        },

        reassessRisk: function(){
            var skimming = this.$('.slider-skimming').slider('value');
            var dispersant = this.$('.slider-dispersant').slider('value');
            var insitu_burn = this.$('.slider-in-situ-burn').slider('value');

            // set model
            var e = this.model.get('efficiency');
            e.skimming = skimming;
            e.dispersant = dispersant;
            e.insitu_burn = insitu_burn;

            // assess model
            this.model.assessment();

        },

        // callback from relative importance ui when values change.
        // to update the UI values and set model values.
        calculateRI: function(objects){
            var surfaceRI = objects['surface'];
            var columnRI = objects['column'];
            var shorelineRI = objects['shoreline'];
            var t = surfaceRI + columnRI + shorelineRI;

            // set model
            var ri = self.model.get('relativeImportance');
            ri.surface = surfaceRI / t;
            ri.column = columnRI / t;
            ri.shoreline = shorelineRI / t;

            // update ui
            self.$('#surfaceRI').html((ri.surface*100).toFixed(3));
            self.$('#columnRI').html((ri.column*100).toFixed(3));
            self.$('#shorelineRI').html((ri.shoreline*100).toFixed(3));

        },

    });

    return riskForm;
});
