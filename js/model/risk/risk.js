define([
    'underscore',
    'backbone',
    'moment',
    'nucos'
], function(_, Backbone, moment, nucos){
    var risk = Backbone.Model.extend({
        url: '/',

        defaults: {
            'area': 0,
            'diameter': 0,
            'distance': 0,
            'depth': 0,

            efficiency: {
                'Skimming': null,
                'Dispersion': null,
                'Burn': null
            },

            'surface': 1/3,
            'column': 1/3,
            'shoreline': 1/3,

            units: {
                'area': 'sq km',
                'diameter': 'km',
                'distance': 'km',
                'depth': 'm'
            }
        },

        initialize: function(options){
            Backbone.Model.prototype.initialize.call(this, options);
            this.fetch();
            this.on('change', this.save, this);
            var attrs = this.attributes;

            if (!_.isUndefined(webgnome.model)){
                this.updateEfficiencies();
            }
        },

        updateEfficiencies: function(){
            var eff = {};
            _.each(webgnome.model.get('weatherers').models, function(el, idx){
                    if (el.get('obj_type') === "gnome.weatherers.cleanup.ChemicalDispersion") {
                        if (!_.isUndefined(el.get('efficiency'))){
                            eff.Dispersion = el.get('efficiency');
                        }
                    } else if (el.get('obj_type') === "gnome.weatherers.cleanup.Burn") {
                        if (!_.isUndefined(el.get('efficiency'))){
                            eff.Burn = el.get('efficiency');
                        }
                    } else if (el.attributes.obj_type === "gnome.weatherers.cleanup.Skimmer") {
                        if (!_.isUndefined(el.get('efficiency'))){
                            eff.Skimming = el.get('efficiency');
                        }
                    }
                });
            this.set('efficiency', eff);
        },

        getMasses: function(){
            var surfaceMass = 0;
            var shorelineMass = 0;
            var waterColumnPercent = 0;
            var amount_released = 0;
            var last_time_index = webgnome.model.get('num_time_steps') - 1;
            _.each(webgnome.mass_balance, function(mass, idx) {
                var data = mass.data[last_time_index];
                if (mass.name.toUpperCase() === 'FLOATING') {
                    surfaceMass = data[1];
                }
                else if (mass.name.toUpperCase() === 'BEACHED' || mass.name.toUpperCase() === 'OBSERVED_BEACHED') {
                    shorelineMass = data[1];
                }
                else if (mass.name.toUpperCase() === 'WATER_CONTENT') {
                    waterColumnPercent = data[1];
                }
                else if (mass.name.toUpperCase() === 'AMOUNT_RELEASED') {
                    amount_released = data[1];
                }
            });
            var waterColumnMass = amount_released * (waterColumnPercent / 100);

            return [surfaceMass, shorelineMass, waterColumnMass];
        },

        assessment: function(){
            var units = this.get('units');
            var area = nucos.convert('Area', units.area, 'm^2', this.get('area'));
            var distance = nucos.convert('Length', units.distance, 'm', this.get('distance'));
            var masses = this.getMasses();

            this.calculateShorelineFract(masses, units);
            this.calculateWaterSurfaceFract(masses, units, area);
            this.calculateWaterColumnFract(masses, units, area);
        },

        calculateShorelineFract: function(masses, units){
            var massShoreline = masses[1];
            var shorelineLOC = 0.5;
            var diameter = nucos.convert('Length', units.diameter, 'm', this.get('diameter'));
            var shorelineLength = Math.PI * diameter;
            var fractOfContaminatedSh = (massShoreline / shorelineLOC) / shorelineLength;
            this.set('shoreline', fractOfContaminatedSh);
        },

        calculateWaterSurfaceFract: function(masses, units, area){
            var massOnWaterSurface = masses[0];
            var waterSurfaceLOC = 0.01;
            var fractOfContaminatedWs = (massOnWaterSurface / waterSurfaceLOC) / area;
            this.set('surface', fractOfContaminatedWs);
        },

        calculateWaterColumnFract: function(masses, units, area){
            var massInWaterColumn = masses[2];
            var waterColumnLOC = 0.001;
            var depth = nucos.convert('Length', units.depth, 'm', this.get('depth'));
            var fractOfContaminatedWc = (massInWaterColumn / waterColumnLOC) / (area * depth);
            this.set('column', fractOfContaminatedWc);
        },

        calculateBenefit: function(){
            var values = this.get('relativeImportance');
            var netERA, subsurfaceBenefit, shorelineBenefit, surfaceBenefit;
            for (var key in values){
                if (key === 'Subsurface'){
                    subsurfaceBenefit = this.get('column') * values[key].data;
                } else if (key === 'Shoreline'){
                    shorelineBenefit = this.get('shoreline') * values[key].data;
                } else if (key === 'Surface'){
                    surfaceBenefit = this.get('surface') * values[key].data;
                }
            }

            netERA = 1 - (subsurfaceBenefit + shorelineBenefit + surfaceBenefit);

            return netERA;
        },

        unitDict: {
            'm^2': 'Area',
            'm': 'Length'
        },

        validateMessageGenerator: function(amount, fromUnits, toUnits){
            var type = this.unitDict[fromUnits];
            var bound = Math.round(nucos.convert(type, fromUnits, toUnits, amount));
            return bound + ' ' + toUnits + '!';
        },

        validate: function(attrs, options){
            var distance = nucos.convert('Length', attrs.units.distance, 'm', attrs.distance);
            var diameter = nucos.convert('Length', attrs.units.diameter, 'm', attrs.diameter);
            var area = nucos.convert('Area', attrs.units.area, 'm^2', attrs.area);
            var depth = nucos.convert('Length', attrs.units.depth, 'm', attrs.depth);
            if (area < 10000 || attrs.area === ''){
                return 'Water area must be greater than ' + this.validateMessageGenerator(10000, 'm^2', attrs.units.area);
            }
            if (area > Math.pow(10, 12)) {
                return 'Water area cannot be larger than ' + this.validateMessageGenerator(Math.pow(10, 12), 'm^2', attrs.units.area);
            }
            if (diameter < 100 || attrs.diameter === ''){
                return 'Water diameter must be greater than ' + this.validateMessageGenerator(100, 'm', attrs.units.diameter);
            }
            if (diameter > Math.pow(10, 6)){
                return 'Water diameter cannot be longer than ' + this.validateMessageGenerator(Math.pow(10, 6), 'm', attrs.units.diameter);
            }
            if (distance < 100 || attrs.distance === ''){
                return 'Distance from shore must be greater than ' + this.validateMessageGenerator(100, 'm', attrs.units.distance);
            }
            if (distance > Math.pow(10, 6)){
                return 'Distance cannot be longer than ' + this.validateMessageGenerator(Math.pow(10, 6), 'm', attrs.units.distance);
            }
            if (depth < 1 || attrs.depth === ''){
                return 'Average water depth must be greater than ' + this.validateMessageGenerator(1, 'm', attrs.units.depth);
            }
            if (depth > 10000){
                return 'Average water depth must be smaller than ' + this.validateMessageGenerator(10000, 'm', attrs.units.depth);
            }
        },

        writeGnomeEff: function(){
            for (var key in this.get('efficiency')){
                if (!_.isNull(this.get('efficiency')[key])){
                    var weatheringModel;
                    if (key === 'Dispersion'){
                        weatheringModel = webgnome.model.get('weatherers').findWhere({'obj_type': 'gnome.weatherers.cleanup.ChemicalDispersion'});
                    } else if (key === 'Burn'){
                        weatheringModel = webgnome.model.get('weatherers').findWhere({'obj_type': 'gnome.weatherers.cleanup.Burn'});
                    } else if (key === 'Skimming'){
                        weatheringModel = webgnome.model.get('weatherers').findWhere({'obj_type': 'gnome.weatherers.cleanup.Skimmer'});
                    }
                    if (!_.isUndefined(weatheringModel)){
                        weatheringModel.cascadeEfficiencies(this.get('efficiency')[key]);
                    }
                }
            }
        },

        // OVERRIDES for local storage of model
        fetch: function() {
            this.set(JSON.parse(localStorage.getItem('risk_calculator')));
        },

        save: function(attributes, options) {
            localStorage.setItem('risk_calculator', JSON.stringify(this.toJSON()));
            this.writeGnomeEff();
        },

        destroy: function(options) {
            localStorage.removeItem('risk_calculator');
        }

    });

    return risk;
    
});
