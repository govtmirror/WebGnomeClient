define([
    'jquery',
    'underscore',
    'backbone',
    'moment',
    'views/modal/form',
    'text!templates/risk/input.html',
    'nucos',
    'jqueryDatetimepicker'
], function($, _, Backbone, moment, FormModal, RiskTemplate, nucos) {
    var riskForm = FormModal.extend({
        className: 'modal form-modal risk-form',
        name: 'risk',
        title: 'Environmental Risk Assessment Input',

        events: function(){
            return _.defaults({}, FormModal.prototype.events);
        },

        initialize: function(options, model) {
            FormModal.prototype.initialize.call(this, options);
            this.model = (model ? model : null);
        },

        render: function(options){
            var formattedTime = moment(this.model.get('assessment_time')).format('YYYY/M/D H:mm');
            this.body = _.template(RiskTemplate, {
                area: this.model.get('area'),
                diameter: this.model.get('diameter'),
                distance: this.model.get('distance'),
                depth: this.model.get('depth'),
                surface: this.model.get('surface'),
                column: this.model.get('column'),
                shoreline: this.model.get('shoreline'),
                direction: this.model.get('direction')
            });

            FormModal.prototype.render.call(this, options);
            this.$('#area-units option[value="' + this.model.get('units').area + '"]').attr('selected', 'selected');
            this.$('#diameter-units option[value="' + this.model.get('units').diameter + '"]').attr('selected', 'selected');
            this.$('#distance-units option[value="' + this.model.get('units').distance + '"]').attr('selected', 'selected');
            this.$('#depth-units option[value="' + this.model.get('units').depth + '"]').attr('selected', 'selected');
            this.$('#water-select option[value="' + this.model.get('waterBodyMetric') + '"]').attr('selected', 'selected');

            this.toggleWaterMetric();

            if (!webgnome.validModel()) {
                this.$('.next').addClass('disabled');
            }

            // this.$('#datetime').datetimepicker({
            //     format: 'Y/n/j G:i',
            // });
            // this.$('#datepick').on('click', _.bind(function(){
            //     this.$('#datetime').datetimepicker('show');
            // }, this));
        },

        // overide the 'Next' button event method
        save: function(callback){
            if(!this.model.isValid()){
                this.error('Error!', this.model.validationError);
            } else {
                this.clearError();

                this.model.assessment();
                this.hide();
                this.trigger('save', [this.model]);
                if(_.isFunction(callback)){ callback(); }
            }
        },

        update: function(e){
            this.model.set('area', this.$('#water-area').val());
            this.model.set('diameter', this.$('#water-diameter').val());
            this.model.set('distance', this.$('#distance-from-shore').val());
            this.model.set('depth', this.$('#average-water-depth').val());
            this.model.set('waterBodyMetric', this.$('#water-select').val());
            this.model.set('direction', this.$('#direction-from-shore').val());
            // this.model.set('assessmentTime', this.$('#datetime').val());

            var units = this.model.get('units');
            units.area = this.$('#area-units').val();
            units.diameter = this.$('#diameter-units').val();
            units.distance = this.$('#distance-units').val();
            units.depth = this.$('#depth-units').val();
            units.direction = this.$('#direction-units').val();

            this.model.set('units', units);

            if(this.model.isValid()){
                this.$('.next').removeClass('disabled');
            }

            this.toggleWaterMetric(e);

            if(!this.model.isValid()){
                this.error('Error!', this.model.validationError);
            } else {
                this.clearError();
            }
        },

        toggleWaterMetric: function(e){
            this.model.deriveAreaDiameter();
            var desiredMetric = this.model.get('waterBodyMetric');
            if (desiredMetric === 'area'){
                this.$('.area').removeClass('hide');
                this.$('.diameter').addClass('hide');
            } else {
                this.$('.area').addClass('hide');
                this.$('.diameter').removeClass('hide');
            }
            this.$('.area input').val(this.model.get('area'));
            this.$('.diameter input').val(this.model.get('diameter'));
        },

        close: function(){
            $('.xdsoft_datetimepicker:last').remove();
            FormModal.prototype.close.call(this);
        }

    });

    return riskForm;
});