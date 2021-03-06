define([
    'jquery',
    'underscore',
    'backbone',
    'module',
    'views/base',
    'moment',
    'nucos',
    'model/step',
    'text!templates/model/fate.html',
    'text!templates/model/ics209.html',
    'text!templates/default/export.html',
    'model/risk/risk',
    'views/wizard/risk',
    'views/form/oil/library',
    'views/form/water',
    'views/form/spill/type',
    'views/form/spill/instant',
    'views/form/spill/continue',
    'views/form/wind',
    'model/element',
    'text!templates/model/fate/buttons.html',
    'text!templates/model/fate/breakdown_item.html',
    'text!templates/model/fate/no_weathering.html',
    'html2canvas',
    'sweetalert',
    'flot',
    'flottime',
    'flotresize',
    'flotstack',
    'flotpie',
    'flotfillarea',
    'flotselect',
    'flotneedle'
], function($, _, Backbone, module, BaseView, moment, nucos, GnomeStep, FateTemplate, ICSTemplate, ExportTemplate, RiskModel, RiskFormWizard, OilLibraryView, WaterForm, SpillTypeForm, SpillInstantForm, SpillContinueForm, WindForm, ElementModel, ButtonsTemplate, BreakdownTemplate, NoWeatheringTemplate, html2canvas, swal){
    'use strict';
    var fateView = BaseView.extend({
        className: 'fate-view',
        frame: 0,
        rendered: false,
        colors: [
            'rgb(203,75,75)',
            'rgb(237,194,64)',
            'rgb(75, 135, 181)',
            'rgb(77,167,77)',
            'rgb(148,64,237)',
            'rgb(189,155,51)',
            'rgb(140,172,198)',
            'rgb(207,124,30)',
            'rgb(119,169,252)',
            'rgb(63,40,87)'
        ],

        events: {
            'shown.bs.tab': 'renderGraphs',
            'click a.run-risk': 'clickRisk',
            'change #budget-table select': 'renderTableOilBudget',
            'click #budget-table .export a.download': 'downloadTableOilBudget',
            'click #budget-table .export a.print': 'printTableOilBudget',
            'change #ics209 input': 'ICSInputSelect',
            'change #ics209 select': 'renderTableICS',
            'click #ics209 .export a.download': 'downloadTableICS',
            'click #ics209 .export a.print': 'printTableICS',
            'click .gnome-help': 'renderHelp',
            'click .saveas': 'saveGraphImage',
            'click .print-graph': 'printGraphImage',
            'click .export-csv': 'exportCSV',
            'change .vol-units': 'renderGraphICS',
            'click .spill .select': 'renderSpillForm',
            'click .substance .select': 'renderOilLibrary',
            'click .water .select': 'renderWaterForm',
            'click .wind .select': 'renderWindForm'
        },
        dataPrecision: 3,

        defaultChartOptions: {
            grid: {
                borderWidth: 1,
                borderColor: '#ddd',
                hoverable: true,
            },
            xaxis: {
                mode: 'time',
                timezone: 'browser'
            },
            series: {
                lines: {
                    show: true,
                    lineWidth: 1
                },
                shadowSize: 0
            },
            yaxis: {},
            needle: {
                on: false,
                stack: false,
                noduplicates: true,
                label: this.formatNeedleLabel,
                x_tooltip: {
                    formatX: function(text){
                        var unix_time = parseInt(text, 10);
                        return moment(unix_time).format(webgnome.config.date_format.moment);
                    }
                }
            },
            legend: {
                position: 'nw'
            }
        },

        tabToLabelMap: {
            'dispersion': 'natural_dispersion',
            'viscosity': 'avg_viscosity',
            'evaporation': 'evaporated',
            'sedimentation': 'sedimentation',
            'density': 'avg_density',
            'emulsification': 'water_content'
        },

        initialize: function(options){
            this.module = module;
            BaseView.prototype.initialize.call(this, options);
            this.$el.appendTo('body');
            if(webgnome.model.validWeathering()){
                this.renderWeathering(options);
            } else {
                webgnome.model.on('change', this.noWeathering, this);
                webgnome.model.get('spills').on('change add remove', this.noWeathering, this);
                this.appendNoWeatheringView();
            }
        },

        renderWeathering: function(options) {
            this.formatXaxisLabel();
            this.render();
            $(window).on('scroll', this.tableOilBudgetStickyHeader);
            webgnome.cache.on('rewind', this.reset, this);
            webgnome.cache.on('step:failed', this.toggleRAC, this);
        },

        appendNoWeatheringView: function() {
            this.$el.appendTo('body');
            this.noWeathering();
        },

        noWeathering: function(options){
            if (webgnome.model.validWeathering()) {
                this.$el.html('');
                this.renderWeathering();
            } else {
                this.$el.html(_.template(NoWeatheringTemplate));

                if(webgnome.model.get('spills').length === 0){
                    this.$('.spill').addClass('missing');
                }

                if(!webgnome.model.getElementType() || !webgnome.model.getElementType().get('substance')){
                    this.$('.substance').addClass('missing');
                }

                if(webgnome.model.get('environment').where({obj_type: 'gnome.environment.environment.Water'}).length === 0){
                    this.$('.water').addClass('missing');
                }

                if(webgnome.model.get('environment').where({obj_type: 'gnome.environment.wind.Wind'}).length === 0){
                    this.$('.wind').addClass('missing');
                }
            }
        },

        renderSpillForm: function() {
            if (webgnome.model.get('spills').length === 0) {
                var spillTypeForm = new SpillTypeForm();
                spillTypeForm.render();
                spillTypeForm.on('hidden', spillTypeForm.close);
                spillTypeForm.on('select', _.bind(function(form){
                    form.on('wizardclose', form.close);
                    form.on('save', _.bind(function(model){
                        webgnome.model.get('spills').add(form.model);
                        webgnome.model.save(null, {validate: false});
                        if(form.$el.is(':hidden')){
                            form.close();
                        } else {
                            form.once('hidden', form.close, form);
                        }
                    }, this));
                }, this));
            } else {
                var spill = webgnome.model.get('spills').at(0);
                var spillView;
                if (spill.get('release').get('release_time') !== spill.get('release').get('end_release_time')){
                    spillView = new SpillContinueForm(null, spill);
                } else {
                    spillView = new SpillInstantForm(null, spill);
                }
                spillView.on('save', function(){
                    spillView.on('hidden', spillView.close);
                });
                spillView.on('wizardclose', spillView.close);
                spillView.render();
            }
        },

        renderWaterForm: function() {
            var waterModel = webgnome.model.get('environment').findWhere({'obj_type': 'gnome.environment.environment.Water'});
            var waterForm = new WaterForm(null, waterModel);
            waterForm.on('hidden', waterForm.close);
            waterForm.on('save', _.bind(function(){
                webgnome.model.get('environment').add(waterForm.model, {merge:true});
                webgnome.model.save(null, {silent: true});
            }, this));
            waterForm.render();
        },

        renderOilLibrary: function() {
            var element_type;
            if (webgnome.model.getElementType()){
                element_type = webgnome.model.getElementType();
            } else {
                element_type = new ElementModel();
            }
            var oilLib = new OilLibraryView({}, element_type);
            oilLib.on('save wizardclose', _.bind(function(){
                if(oilLib.$el.is(':hidden')){
                    oilLib.close();
                } else {
                    oilLib.once('hidden', oilLib.close, oilLib);
                }
                webgnome.obj_ref[element_type.id] = element_type;
                this.noWeathering();
            }, this));
            oilLib.render();
        },

        renderWindForm: function() {
            var windForm;
            var windModel = webgnome.model.get('environment').findWhere({'obj_type': 'gnome.environment.wind.Wind'});

            if (!_.isNull(windModel)) {
                windForm = new WindForm(null, windModel);
            } else {
                windForm = new WindForm();
            }

            windForm.on('save', _.bind(function(){
                webgnome.model.get('environment').add(windForm.model, {merge: true});
                webgnome.model.save(null, {silent: true});
            }, this));

            windForm.on('hidden', windForm.close);
            windForm.render();
        },

        toggleRAC: function(){
            this.$('.run-risk').toggleClass('disabled');
        },

        formatXaxisLabel: function() {
            if (this.getUserTimePrefs() === 'datetime') { return; }
            var xaxisOpts = this.defaultChartOptions.xaxis;
            xaxisOpts.tickFormatter = this.xaxisTickFormatter;
        },

        xaxisTickFormatter: function(val, axis) {
            var start = axis.min;
            var current = val;
            var timeDiff = (moment(current).diff(moment(start), 'm') / 60.0).toFixed(2);
            var currentTimeDiffisWhole = (parseFloat(timeDiff) === parseInt(timeDiff, 10));
            var diffInFractHours = (!currentTimeDiffisWhole) ? timeDiff : moment(current).diff(moment(start), 'h');
            return diffInFractHours + ' hours';
        },

        getUserTimePrefs: function() {
            return webgnome.user_prefs.get('time');
        },

        getXaxisLabel: function() {
            return 'Time (' + this.getUserTimePrefs() + ')';
        },

        load: function(){
            if(webgnome.cache.length > 0){
                // incase trajectory triggered a /step but it hasn't returned yet
                // and the user just toggled the switch to fate view
                // add a listener to handle that pending step.
                if(webgnome.cache.fetching){
                    webgnome.cache.once('step:recieved', this.load, this);
                } else {
                    while(this.frame < webgnome.cache.length){
                        webgnome.cache.at(this.frame, _.bind(this.loadStep, this));
                        this.frame++;
                    }
                }
            } else {
                webgnome.cache.on('step:recieved', this.buildDataset, this);
                setTimeout(function(){
                    webgnome.cache.step();
                }, 200);
            }
        },

        loadStep: function(err, step){
           this.formatStep(step);

            // on the last step render the graph and if there are more steps start the steping.
            if(step.get('step_num') === webgnome.cache.length - 1){
                this.renderGraphs();
                if(step.get('step_num') < webgnome.model.get('num_time_steps')){
                    webgnome.cache.on('step:recieved', this.buildDataset, this);
                    setTimeout(function(){
                        webgnome.cache.step();
                    }, 200);
                }
            }
        },

        reset: function(){
            webgnome.cache.off('step:recieved', this.buildDataset, this);
            if(webgnome.cache.fetching){
                webgnome.cache.once('step:recieved', this.reset, this);
            } else {
                webgnome.cache.on('step:recieved', this.buildDataset, this);
                this.dataset = undefined;
                this.frame = 0;
                this.renderLoop();
            }
            this.toggleRAC();
        },

        render: function(){
            BaseView.prototype.render.call(this);
            var compiled;
            var spills = webgnome.model.get('spills');
            var substance = webgnome.model.get('spills').at(0).get('element_type').get('substance');
            var wind = webgnome.model.get('weatherers').findWhere({obj_type: 'gnome.weatherers.evaporation.Evaporation'}).get('wind');
            var wind_speed;
            var time = this.getXaxisLabel();
            if(_.isUndefined(wind)){
                wind_speed = '';
            } else if (wind.get('timeseries').length === 1) {
                wind_speed = 'Constant ' + wind.get('timeseries')[0][1][0] + ' ' + wind.get('units');
            } else {
                wind_speed = 'Variable Speed';
            }

            var water = webgnome.model.get('weatherers').findWhere({obj_type: 'gnome.weatherers.evaporation.Evaporation'}).get('water');
            var wave_height = 'Computed from wind';
            var total_released = this.calcAmountReleased(spills, webgnome.model) + ' ' + spills.at(0).get('units');

            if(water.get('wave_height')){
                wave_height = water.get('wave_height') + ' ' + water.get('units').wave_height;
            } else if (water.get('fetch')) {
                wave_height = water.get('fetch') + ' ' + water.get('units').fetch;
            }

            var cleanup = this.checkForCleanup();

            var init_release = this.findInitialRelease(spills);

            var buttonsTemplate = _.template(ButtonsTemplate, {});

            var templateObj;

            if (!_.isNull(substance)){
                var pour_point;
                var pp_min = Math.round(nucos.convert('Temperature', 'k', 'c', substance.get('pour_point_min_k')) * 100) / 100;
                var pp_max = Math.round(nucos.convert('Temperature', 'k', 'c', substance.get('pour_point_max_k')) * 100) / 100;
                if(pp_min === pp_max){
                    pour_point = pp_min;
                } else if (pp_min && pp_max) {
                    pour_point = pp_min + ' - ' + pp_max;
                } else {
                    pour_point = pp_min + pp_max;
                }

                templateObj = {
                    name: substance.get('name'),
                    api: substance.get('api'),
                    wind_speed: wind_speed,
                    pour_point: pour_point + ' &deg;C',
                    wave_height: wave_height,
                    water_temp: water.get('temperature') + ' &deg;' + water.get('units').temperature,
                    release_time: moment(init_release, 'X').format(webgnome.config.date_format.moment),
                    total_released: total_released,
                    units: spills.at(0).get('units'),
                    buttons: buttonsTemplate,
                    time: time
                };

            } else {
                templateObj = {
                    name: 'Non-weathering substance',
                    api: 'N/A',
                    wind_speed: wind_speed,
                    pour_point: 'N/A',
                    wave_height: wave_height,
                    water_temp: water.get('temperature') + ' &deg;' + water.get('units').temperature,
                    release_time: moment(init_release, 'X').format(webgnome.config.date_format.moment),
                    total_released: total_released,
                    units: spills.at(0).get('units'),
                    buttons: buttonsTemplate,
                    time: time
                };
            }

            templateObj.rate_exposed = false;

            if (spills.length === 1 && spills.at(0).spillType() === 'continuous') {
                var spill = spills.at(0);
                var durationObj = spill.parseDuration();
                var hours = durationObj.days * 24 + durationObj.hours;
                templateObj.duration = hours + ' hours';
                templateObj.spill_rate = (spill.get('amount') / hours).toFixed(2) + ' ' + spill.get('units') + '/hour';
                templateObj.rate_exposed = true;
            }
            
            compiled = _.template(FateTemplate, templateObj);

            this.$el.html(compiled);
            this.rendered = true;

            this.$('#ics209 #start_time, #ics209 #end_time').datetimepicker({
                minDate: moment(webgnome.model.get('start_time')).format('YYYY/MM/DD'),
                startDate: moment(webgnome.model.get('start_time')).format('YYYY/MM/DD'),
                maxDate: moment(webgnome.model.get('start_time')).add(webgnome.model.get('duration'), 's').format('YYYY/MM/DD'),
                format: webgnome.config.date_format.datetimepicker,
                allowTimes: webgnome.config.date_format.half_hour_times,
                step: webgnome.config.date_format.time_step
            });
            this.$('#datepick_start').on('click', _.bind(function(){
                this.$('#start_time').datetimepicker('show');
            }, this));
            this.$('#datepick_end').on('click', _.bind(function(){
                this.$('#end_time').datetimepicker('show');
            }, this));
            var units = spills.at(0).get('units');
            this.$('#budget-table .released').val(units);
            this.$('#ics209 .vol-units').val(units);

            this.$('.export a').tooltip({
                placement: 'bottom',
                container: 'body'
            });

            if (cleanup === 0) {
                this.$('.run-risk').hide();
            }
            
            this.load();
        },

        checkForCleanup: function(){
            var weatherers = webgnome.model.get('weatherers');
            var total = 0;
            for (var i = 0; i < weatherers.length; i++){
                if (weatherers.at(i).get('obj_type').indexOf('cleanup') > -1){
                    total++;
                }
            }
            return total;
        },

        clickRisk: function(){
            var spills = webgnome.model.get('spills');
            var numOfCleanups = this.checkForCleanup();
            if (spills.length === 1 && numOfCleanups > 0){
                var riskWizard = new RiskFormWizard();
                riskWizard.render();
            } else {
                var swalObj;
                if (spills.length > 1) {
                    swalObj = {
                        title: "Too many spills on the model!",
                        text: "Risk assessment only supports one spill. Delete the other spills to run the risk assessment tool.",
                        type: "warning",
                        confirmButtonText: "Edit Model",
                        closeOnConfirm: true,
                        showCancelButton: true
                    };
                } else if (numOfCleanups <= 0) {
                    swalObj = {
                        title: "Cleanup operations needed!",
                        text: "Risk assessment needs at least one cleanup option.",
                        type: "warning",
                        confirmButtonText: "Edit Model",
                        closeOnConfirm: true,
                        showCancelButton: true
                    };
                }
                swal(swalObj).then(function(isConfirm){
                    if (isConfirm) {
                        webgnome.router.navigate('config', true);
                    }
                });
            }
        },

        renderLoop: function(){
            if(_.isUndefined(this.dataset)){
                webgnome.cache.step();
            } else {
                this.renderGraphs();
            }
        },

        showHelp: function(){
            this.$('.gnome-help').show();
            this.$('.gnome-help').tooltip();
        },

        renderGraphs: function(){
            // find active tab and render it's graph.
            var parentTabId = this.$('.active a').attr('href');
            var active = this.$(parentTabId + ' .active a').attr('href');

            if (_.isUndefined(active)) {
                active = parentTabId;
            }

            $('#flotTip').remove();

            if(active === '#budget-graph') {
                this.renderGraphOilBudget(this.dataset);
            } else if(active === '#budget-table') {
                this.renderTableOilBudget(this.dataset);
            } else if(active === '#evaporation') {
                this.renderGraphEvaporation(this.dataset);
            } else if(active === '#dispersion') {
                this.renderGraphDispersion(this.dataset);
            } else if (active === '#dissolution') {
                this.renderGraphDissolution(this.dataset);
            } else if(active === '#sedimentation') {
                this.renderGraphSedimentation(this.dataset);
            } else if(active === '#density') {
                this.renderGraphDensity(this.dataset);
            } else if(active === '#emulsification') {
                this.renderGraphEmulsification(this.dataset);
            } else if(active === '#viscosity') {
                this.renderGraphViscosity(this.dataset);
            } else if(active === '#ics209') {
                this.renderGraphICS(this.dataset);
            }
        },

        renderGraphOilBudget: function(dataset){
            var cloneset = this.pruneDataset(JSON.parse(JSON.stringify(dataset)), [
                'avg_density',
                'amount_released',
                'avg_viscosity',
                'step_num',
                'time_stamp',
                'water_content',
                'non_weathering',
                'water_density',
                'water_viscosity',
                'dispersibility_difficult',
                'dispersibility_unlikely'
                ]);
            var selection = this.$('.panel-primary').data('dataset');

            for(var i = 0; i < cloneset.length; i++){
                cloneset[i].data = cloneset[i][selection];
            }

            if(_.isUndefined(this.graphOilBudget)){
                var options = $.extend(true, {}, this.defaultChartOptions);
                options.grid.autoHighlight = false;
                options.series.stack = true;
                options.series.group = true;
                options.series.lines.fill = 1;
                options.needle.tooltips = false;
                options.colors = this.colors;
                options.legend.show = false;
                this.graphOilBudget = $.plot('#budget-graph .timeline .chart .canvas', cloneset, options);
                this.renderPiesTimeout = null;
                this.$('#budget-graph .timeline .chart .canvas').on('plothover', _.bind(this.timelineHover, this));
            } else {
                this.graphOilBudget.setData(cloneset);
                this.graphOilBudget.setupGrid();
                this.graphOilBudget.draw();
            }
            this.timelineHover(null, {x: cloneset[0].data[cloneset[0].data.length - 1][0]}, null);
        },

        timelineHover: function(e, pos, item){
            if(!this.renderPiesTimeout){
                this.renderPiesTimeout = setTimeout(_.bind(function(){
                    this.renderPies(this.dataset, pos);
                    this.renderBreakdown(this.dataset, pos);
                }, this), 50);
            }
        },

        renderBreakdown: function(datasetparam, pos){
            var dataset = this.pruneDataset(datasetparam, [
                'avg_density',
                'avg_viscosity',
                'step_num',
                'time_stamp',
                'water_content',
                'non_weathering',
                'water_density',
                'water_viscosity',
                'dispersibility_difficult',
                'dispersibility_unlikely'
            ]);
            
            var data = this.getPieData(pos, dataset, this.$('#budget-graph .panel-primary').data('dataset'));
            if(data.length > 0){
                var con_width = this.$('.breakdown').width() - (15 * (data.length - 2));
                var width = Math.floor(con_width / (data.length - 1));
                var compiled = '';
                var units = webgnome.model.get('spills').at(0).get('units');
                for(var i = 0; i < data.length; i++){
                    if(data[i].label !== 'Amount released'){
                        var k = i - 1;
                        compiled += _.template(BreakdownTemplate, {
                            color: this.colors[k],
                            width: width,
                            label: data[i].label,
                            value: Math.round(data[i].data) + ' ' + units
                        });
                    }
                }
                this.$('.breakdown').html(compiled);
            }
        },

        renderPies: function(dataset, pos){
            this.renderPiesTimeout = null;
            if(this.$('#budget-graph:visible .timeline .chart').length !== 1){
                return;
            }
            
            var i, j;
            dataset = this.pruneDataset(dataset, [
                'avg_density',
                'amount_released',
                'avg_viscosity',
                'step_num',
                'time_stamp',
                'water_content',
                'non_weathering',
                'water_density',
                'water_viscosity',
                'dispersibility_difficult',
                'dispersibility_unlikely'
                ]);
            var lowData = this.getPieData(pos, dataset, 'low');
            var nominalData = this.getPieData(pos, dataset, 'nominal');
            var highData = this.getPieData(pos, dataset, 'high');

            var chartOptions = {
                series: {
                    pie: {
                        show: true,
                        stroke: {
                            width: 0
                        },
                        label: {
                            show: false
                        },
                        innerRadius: 0.65
                    }
                },
                colors: this.colors,
                legend: {
                    show: false
                }
            };

            // possibly rewrite this part to update the data set and redraw the chart
            // might be more effecient than completely reinitalizing
            if(nominalData.length > 0){
                this.nominalPlot = $.plot('.mean .canvas', nominalData, chartOptions);
                this.$('.mean .oil-total').html('<span>' + Math.round(this.pieFloating(nominalData)) + ' ' + webgnome.model.get('spills').at(0).get('units') + '</span><br />Floating Oil');

                if (this.uncertainityExists){
                    this.highPlot = $.plot('.maximum .canvas', highData, chartOptions);
                    this.$('.maximum .oil-total').html('<span>' + Math.round(this.pieFloating(highData)) + ' ' + webgnome.model.get('spills').at(0).get('units') + '</span><br />Floating Oil');

                    this.lowPlot = $.plot('.minimum .canvas', lowData, chartOptions);
                    this.$('.minimum .oil-total').html('<span>' + Math.round(this.pieFloating(lowData)) + ' ' + webgnome.model.get('spills').at(0).get('units') + '</span><br />Floating Oil');

                } else if (this.$('.chart-holder-uncert.invisible').length === 0) {
                    this.$('.chart-holder-uncert').addClass('invisible');
                }
            }
        },

        pieFloating: function(data){
            for(var i = 0; i < data.length; i++){
                if(data[i].label === 'Floating'){
                    return data[i].data;
                }
            }
        },

        getPieData: function(pos, dataset, key){
            var d = [];
            for (var i = 0; i < dataset.length; ++i) {

                var series = dataset[i];

                for (var j = 0; j < series[key].length; ++j) {
                    if (series[key][j][0] >= pos.x) {
                        break;
                    }
                }

                var y,
                    p1 = series[key][j - 1],
                    p2 = series[key][j];

                if(!_.isUndefined(p1) && !_.isUndefined(p2)){
                    if (p1 === null) {
                        y = p2[1];
                    } else if (p2 === null) {
                        y = p1[1];
                    } else {
                        y = p1[1] + (p2[1] - p1[1]) * (pos.x - p1[0]) / (p2[0] - p1[0]);
                    }
                    
                    d.push({label: this.formatLabel(series.name), data: y});
                }
            }
            return d;
        },

        renderTableOilBudget: function(dataset){
            if(!_.isArray(dataset)){
                dataset = _.clone(this.dataset);
            }
            dataset = this.pruneDataset(dataset, [
                'avg_density',
                'avg_viscosity',
                'step_num',
                'time_stamp',
                'water_content',
                'non_weathering',
                'water_density',
                'water_viscosity',
                'dispersibility_difficult',
                'dispersibility_unlikely'
                ]);
            var table = this.$('#budget-table table:first');
            var display = {
                time: this.$('#budget-table .time').val().trim(),
                released: this.$('#budget-table .released').val().trim(),
                other: this.$('#budget-table .other').val().trim()
            };
            var converter = new nucos.OilQuantityConverter();
            var spill = webgnome.model.get('spills').at(0);
            var substance = spill.get('element_type').get('substance');
            var substanceAPI;
            if (_.isNull(substance)){
                substanceAPI = 10;
            } else {
                substanceAPI = substance.get('api');
            }
            var from_unit = spill.get('units');
            var to_unit = display.released;
            var total_released = this.calcAmountReleased(webgnome.model.get('spills'), webgnome.model);
            var converted_amount = Math.round(converter.Convert(total_released, from_unit, substanceAPI, 'API degree', to_unit));
            this.$('#budget-table .info .amount-released').text(converted_amount + ' ' + to_unit);
            var spillDurationObj = spill.parseDuration();
            var spillDurationHrs = spillDurationObj.days * 24 + spillDurationObj.hours;
            this.$('#budget-table .info .rate-released').text((converted_amount / spillDurationHrs).toFixed(2) + ' ' + to_unit + '/hour');

            table.html('');
            table = '';
            var m_date = moment(webgnome.model.get('start_time'));
            var opacity;
            for (var row = 0; row < dataset[0].data.length; row++){
                var ts_date = moment(dataset[0].data[row][0]);
                var duration = moment.duration(ts_date.unix() - m_date.unix(), 'seconds');
                var durationAsHrs = parseInt(duration.asHours(), 10);

                if(ts_date.minutes() === 0 && (duration.asHours() < 7 ||
                    duration.asHours() < 25 && duration.asHours() % 3 === 0 ||
                    duration.asHours() < 49 && duration.asHours() % 6 === 0 ||
                    duration.asHours() < 121 && duration.asHours() % 12 === 0 ||
                    duration.asHours() > 121 && duration.asHours() % 24 === 0) &&
                    (durationAsHrs === duration.asHours())){
                    if(opacity === 0.10){
                        opacity = 0.25;
                    } else {
                        opacity = 0.10;
                    }

                    var row_html = '';
                    if(parseInt(row, 10) === 0){
                        row_html += '<thead><tr>';
                    } else {
                        row_html += '<tr class="' + row + '">';
                    }
                    if(display.time === 'date'){
                        if(row === 0){
                            row_html += '<th>Date - Time</th>';
                        } else {
                            row_html += '<td>' + ts_date.format(webgnome.config.date_format.moment) + '</td>';
                        }
                    } else {
                        if(row === 0){
                            row_html += '<th>Time (hours)</th>';
                        } else {
                            row_html += '<td>' + duration.asHours() + '</td>';
                        }
                    }

                    for (var set in dataset){
                        to_unit = display.released;
                        var color = '';

                        if (dataset[set].label !== 'Amount released') {
                            var offByOne = set - 1;
                            color = this.colors[offByOne];
                            color = color.replace('rgb', 'rgba').replace(')', ',' + opacity + ')');
                        }

                        if (row === 0) {
                            if (dataset[set].name === 'amount_released' || display.other === 'same') {
                                row_html +='<th style="background: ' + color + ';">' + dataset[set].label + ' (' + to_unit + ')</th>';
                            } else {
                                row_html += '<th style="background: ' + color + ';">' + dataset[set].label + ' (' + display.other + ')</th>';
                            }

                        } else {
                            var value = dataset[set].data[row][1];
                            if(dataset[set].label === 'Amount released'){
                                 value = Math.round(converter.Convert(value, from_unit, substanceAPI, 'API degree', to_unit));
                                 to_unit = ' ' + to_unit;
                            } else {
                                if(display.other === 'same'){
                                    value = Math.round(converter.Convert(value, from_unit, substanceAPI, 'API degree', to_unit));
                                } else if (display.other === 'percent'){
                                    value = Math.round(value / dataset[0].data[row][1] * 100);
                                } else {
                                    value = Math.round(value / dataset[0].data[row][1] * 100) / 100;
                                }
                            }
                            row_html += '<td style="background: ' + color + ';">' + value + '</td>';
                        }
                    }
                    if(row === 0){
                        row_html += '</tr></thead>';
                    } else {
                        row_html += '</tr>';
                    }
                    table += row_html;
                }
            }
            this.$('#budget-table table:first').html(table);
            if($('.container.sticky').length > 0){
                $('.container.sticky table:first').html(table);
            }
        },

        tableOilBudgetStickyHeader: function(e){
            if(this.$('#budget-table:visible').length > 0){
                var top = $(window).scrollTop() + 50;
                var offset = this.$('#budget-table table:first').offset();

                if(top > offset.top && this.$('#budget-table .sticky').length === 0){
                    // a sticky header to the table.
                    $('<div class="container sticky"><div class="col-md-12"><table class="table">' + this.$('#budget-table table:last').html() + '</table></div></div>').insertAfter('#budget-table table');
                } else if(top <= offset.top && this.$('#budget-table .sticky').length > 0) {
                    // remove the sticky header from the table.
                    this.$('.sticky').remove();
                }
            }
        },

        downloadTableOilBudget: function(e){
            var table = this.$('#budget-table table');
            var type = $(e.target).data('type');
            if(type === undefined){
                type = $(e.target).parent().data('type');
            }
            var name = webgnome.model.get('name') ? webgnome.model.get('name') + ' Oil Budget Table Export' : 'Oil Budget Table Export';
            var filename = name + '.' + type;
            var content = '';

            switch(type){
                case 'csv':
                    content = this.tableToCSV(table, this.$('#budget-table .info div'));
                    break;
                case 'html':
                    content = this.tableToHTML(table, this.$('#budget-table .info').html());
                    break;
            }

            var pom = document.createElement('a');
            pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
            pom.setAttribute('download', filename);
            pom.click();
        },

        printTableOilBudget: function(e){
            window.print();
        },

        renderGraphEvaporation: function(dataset){
            dataset = this.pluckDataset(dataset, ['evaporated']);
            dataset[0].fillArea = [{representation: 'symmetric'}, {representation: 'asymmetric'}];
            if(_.isUndefined(this.graphEvaporation)){
                var options = $.extend(true, {}, this.defaultChartOptions);
                options.colors = [this.colors[0]];
                this.graphEvaporation = $.plot('#evaporation .timeline .chart .canvas', dataset, options);
            } else {
                this.graphEvaporation.setData(dataset);
                this.graphEvaporation.setupGrid();
                this.graphEvaporation.draw();
            }
            dataset[0].fillArea = null;
        },

        renderGraphDispersion: function(dataset){
            dataset = this.pluckDataset(dataset, ['natural_dispersion']);
            dataset[0].fillArea = [{representation: 'symmetric'}, {representation: 'asymmetric'}];
            if(_.isUndefined(this.graphDispersion)){
                var options = $.extend(true, {}, this.defaultChartOptions);
                options.colors = [this.colors[1]];
                this.graphDispersion = $.plot('#dispersion .timeline .chart .canvas', dataset, options);
            } else {
                this.graphDispersion.setData(dataset);
                this.graphDispersion.setupGrid();
                this.graphDispersion.draw();
            }
            dataset[0].fillArea = null;
        },

        renderGraphSedimentation: function(dataset){
            dataset = this.pluckDataset(dataset, ['sedimentation']);
            dataset[0].fillArea = [{representation: 'symmetric'}, {representation: 'asymmetric'}];
            if(_.isUndefined(this.graphSedimentation)){
                var options = $.extend(true, {}, this.defaultChartOptions);
                options.colors = [this.colors[3]];
                this.graphSedimentation = $.plot('#sedimentation .timeline .chart .canvas', dataset, options);
            } else {
                this.graphSedimentation.setData(dataset);
                this.graphSedimentation.setupGrid();
                this.graphSedimentation.draw();
            }
            dataset[0].fillArea = null;
        },

        renderGraphDensity: function(dataset){
            dataset = this.pluckDataset(dataset, ['avg_density', 'water_density']);
            dataset[0].fillArea = [{representation: 'symmetric'}, {representation: 'asymmetric'}];
            dataset[0].label = 'Average Oil (Emulsion) Density';
            if(_.isUndefined(this.graphDensity)){
                var options = $.extend(true, {}, this.defaultChartOptions);
                options.yaxis.ticks = 4;
                options.yaxis.tickDecimals = 2;
                this.graphDensity = $.plot('#density .timeline .chart .canvas', dataset, options);
            } else {
                this.graphDensity.setData(dataset);
                this.graphDensity.setupGrid();
                this.graphDensity.draw();
            }
            dataset[0].fillArea = null;
        },

        renderGraphEmulsification: function(dataset){
            dataset = this.pluckDataset(dataset, ['water_content']);
            dataset[0].fillArea = [{representation: 'symmetric'}, {representation: 'asymmetric'}];
            if(_.isUndefined(this.graphEmulsification)){
                var options = $.extend(true, {}, this.defaultChartOptions);
                this.graphEmulsificaiton = $.plot('#emulsification .timeline .chart .canvas', dataset, options);
            } else {
                this.graphEmulsification.setData(dataset);
                this.graphEmulsification.setupGrid();
                this.graphEmulsification.draw();
            }
            dataset[0].fillArea = null;
        },

        renderGraphViscosity: function(dataset){
            dataset = this.pluckDataset(dataset, ['avg_viscosity', 'water_viscosity', 'dispersibility_difficult', 'dispersibility_unlikely']);
            dataset[0].fillArea = [{representation: 'symmetric'}, {representation: 'asymmetric'}];
            if(_.isUndefined(this.graphViscosity)){
                var options = $.extend(true, {}, this.defaultChartOptions);
                options.yaxis = {
                    ticks: [1, 10, 100, 1000, 10000, 100000, 10000000],
                    tickFormatter: function(tick){
                        return tick.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                    },
                    transform: function(v){
                        return Math.log(v+10);
                    },
                    inverseTransform: function(v){
                        return Math.exp(v);
                    },
                    tickDecimals: 0
                };
                this.graphViscosity = $.plot('#viscosity .timeline .chart .canvas', dataset, options);
            } else {
                this.graphViscosity.setData(dataset);
                this.graphViscosity.setupGrid();
                this.graphViscosity.draw();
            }
            dataset[0].fillArea = null;
        },

        renderGraphDissolution: function(dataset){
            dataset = this.pluckDataset(dataset, ['dissolution']);
            dataset[0].fillArea = [{representation: 'symmetric'}, {representation: 'asymmetric'}];
            if(_.isUndefined(this.graphDissolution)) {
                var options = $.extend(true, {}, this.defaultChartOptions);
                options.colors = [this.colors[2]];
                this.graphDissolution = $.plot('#dissolution .timeline .chart .canvas', dataset, options);
            } else {
                this.graphDissolution.setData(dataset);
                this.graphDissolution.setupGrid();
                this.graphDissolution.draw();
            }
            dataset[0].fillArea = null;
        },

        convertDataset: function(d, to_unit){
            var dataset = $.extend(true, [], d);
            var substance = webgnome.model.get('spills').at(0).get('element_type').get('substance');
            var api = (!_.isNull(substance)) ? substance.get('api') : 10;
            var from_unit = webgnome.model.get('spills').at(0).get('units');
            var converter = new nucos.OilQuantityConverter();

            if (to_unit === from_unit) {
                return dataset;
            }

            for (var set in dataset) {
                var data = dataset[set].data;
                for (var i = 0; i < data.length; i++) {
                    var arr = data[i];
                    for (var k = 1; k < arr.length; k++) {
                        arr[k] = parseFloat(converter.Convert(arr[k], from_unit, api, 'API Degree', to_unit));
                    }
                }
            }

            return dataset;
        },

        renderGraphICS: function(dataset){
            if(!_.isArray(dataset)){
                dataset = this.dataset;
            }
            dataset = this.pruneDataset(dataset, ['avg_density',
                'amount_released',
                'avg_viscosity',
                'step_num',
                'time_stamp',
                'water_content',
                'non_weathering',
                'water_density',
                'water_viscosity',
                'dispersibility_difficult',
                'dispersibility_unlikely',
                ]);
            var icsUnits = this.$('.vol-units').val();
            dataset = this.convertDataset(dataset, icsUnits);
            this.$('#ics209 .yaxisLabel').text(icsUnits);
            if(_.isUndefined(this.graphICS)){
                this.$('#ics209 .timeline .chart .canvas').on('plotselected', _.bind(this.ICSPlotSelect, this));
                
                // prevent the user from accidentally or purposfully unselecting
                // the time range.
                this.$('#ics209 .timeline .chart .canvas').on('plotunselected', _.bind(function(e, ranges){
                    this.graphICS.setSelection(this.ICSSelection);
                }, this));

                var options = $.extend(true, {}, this.defaultChartOptions);
                options.grid.autoHighlight = false;
                options.series.stack = true;
                options.series.group = true;
                options.series.lines.fill = 1;
                options.colors = this.colors;
                options.selection = {mode: 'x', color: '#428bca'};
                options.crosshair = undefined;
                options.tooltip = false;
                options.needle = false;
                options.legend = false;
                
                this.graphICS = $.plot('#ics209 .timeline .chart .canvas', dataset, options);

            } else {
                this.graphICS.setData(dataset);
                this.graphICS.setupGrid();
                this.graphICS.draw();
                if(this.ICSSelection){
                    this.graphICS.setSelection(this.ICSSelection);
                }
            }
        },

        ICSPlotSelect: function(e, ranges){
            var start_input = this.$('#ics209 #start_time');
            var end_input = this.$('#ics209 #end_time');
            var date_format = webgnome.config.date_format.moment;
            var start_time = moment(parseInt(ranges.xaxis.from, 10) / 1000, 'X');
            var end_time = moment(parseInt(ranges.xaxis.to, 10) / 1000, 'X');
            var selection = {
                xaxis: {
                    from: start_time.unix() * 1000,
                    to: end_time.unix() * 1000
                },
                yaxis:{
                    from: ranges.yaxis.from,
                    to: ranges.yaxis.to
                }
            };

            this.updateICSSelection(selection);
        },

        ICSInputSelect: function(){
            var date_format = webgnome.config.date_format.moment;
            var model_start_time = webgnome.model.get('start_time');
            var start_input = this.$('#ics209 #start_time').val();
            var end_input = this.$('#ics209 #end_time').val();
            var time_span_hrs = 24;

            if(!start_input || !end_input){ return null; }

            var start_time = moment(start_input, date_format);
            var end_time = moment(end_input, date_format);
            var selection = {
                xaxis: {
                    from: start_time.unix() * 1000,
                    to: end_time.unix() * 1000
                }
            };
            if (!_.isUndefined(this.ICSSelection)){
                selection.yaxis = {
                    from: this.ICSSelection.yaxis.from,
                    to: this.ICSSelection.yaxis.to
                };
            } else {
                selection.yaxis = {};
            }

            this.updateICSSelection(selection);
        },

        updateICSSelection: function(selection){
            var start_input = this.$('#ics209 #start_time');
            var end_input = this.$('#ics209 #end_time');
            var date_format = webgnome.config.date_format.moment;
            var changed = true;

            if(!_.isUndefined(this.ICSSelection)){
                if(selection.xaxis.to !== this.ICSSelection.xaxis.to ||
                selection.xaxis.from !== this.ICSSelection.xaxis.from){
                    start_input.val(moment(selection.xaxis.from / 1000, 'X').format(date_format));
                    end_input.val(moment(selection.xaxis.to / 1000, 'X').format(date_format));
                    changed = true;
                } else {
                    changed = false;
                }
            } else {
                start_input.val(moment(selection.xaxis.from / 1000, 'X').format(date_format));
                end_input.val(moment(selection.xaxis.to / 1000, 'X').format(date_format));
            }

            if(changed){
                this.renderTableICS(selection);
                this.graphICS.setSelection(selection, true);
            }
            this.ICSSelection = selection;
        },

        renderTableICS: function(selection){
            if(!_.has(selection, 'xaxis') && _.isUndefined(this.ICSSelection)){
                return false;
            } else if(!_.has(selection, 'xaxis')){
                selection = this.ICSSelection;
            }

            var start = selection.xaxis.from;
            var end = selection.xaxis.to;
            var from_units = webgnome.model.get('spills').at(0).get('units');
            var to_units = this.$('#ics209 .vol-units').val() === null ? from_units : this.$('#ics209 .vol-units').val();
            var converter = new nucos.OilQuantityConverter();
            var substance = webgnome.model.get('spills').at(0).get('element_type').get('substance');
            var api = (!_.isNull(substance)) ? substance.get('api') : 10;
            var dataset = this.pluckDataset(this.dataset, ['natural_dispersion', 'amount_released', 'chem_dispersed', 'evaporated', 'floating', 'burned', 'skimmed', 'sedimentation', 'beached', 'dissolution']);
            var report = {
                spilled: 0,
                evaporated: 0,
                chem_dispersed: 0,
                burned: 0,
                skimmed: 0,
                floating: 0,
                amount_released: 0,
                natural_dispersion: 0,
                other_natural: 0,
                sedimentation: 0,
                dissolution: 0,
                beached: 0
            };
            var cumulative = _.clone(report);
            var low = _.clone(report);
            var high =  _.clone(report);

            for(var set in dataset){
                for(var step in dataset[set].data){
                    if(dataset[set].data[step][0] >= start && dataset[set].data[step][0] <= end){
                        var previous = 0;
                        if(dataset[set].data[step - 1]){
                            previous = Math.round(parseFloat(converter.Convert(dataset[set].data[step - 1][1], from_units, api, 'API Degree', to_units)));
                        }
                        var current = Math.round(parseFloat(converter.Convert(dataset[set].data[step][1], from_units, api, 'API Degree', to_units)));
                        report[dataset[set].name] += current - previous;
                    }
                }
                for(var step2 in dataset[set].data){
                    if(dataset[set].data[step2][0] <= end){
                        cumulative[dataset[set].name] = Math.round(parseFloat(converter.Convert(dataset[set].data[step2][1], from_units, api, 'API Degree', to_units)));
                    }
                }
                for(var step3 in dataset[set].low){
                    if(dataset[set].low[step3][0] <= end){
                        low[dataset[set].name] = Math.round(parseFloat(converter.Convert(dataset[set].low[step3][1], from_units, api, 'API Degree', to_units)));
                    }
                }
                for(var step4 in dataset[set].high){
                    if(dataset[set].high[step4][0] <= end){
                        high[dataset[set].name] = Math.round(parseFloat(converter.Convert(dataset[set].high[step4][1], from_units, api, 'API Degree', to_units)));
                    }
                }
            }

            cumulative.other_natural += cumulative.sedimentation;
            cumulative.other_natural += cumulative.dissolution;
            low.other_natural += low.sedimentation;
            low.other_natural += low.dissolution;
            high.other_natural += high.sedimentation;
            high.other_natural += high.dissolution;
            report.other_natural += report.sedimentation;
            report.other_natural += report.dissolution;

            report.floating = report.floating > 0 ? report.floating : 0;

            var amount_type = 'Volume Spilled';
            var mass_units = ['kg', 'metric ton', 'ton'];

            if (mass_units.indexOf(to_units) > -1) {
                amount_type = 'Mass Spilled';
            }
            
            var compiled = _.template(ICSTemplate, {
                amount_type: amount_type,
                report: report,
                cumulative: cumulative,
                low: low,
                high: high,
                units: to_units
            });

            this.$('#ics209 .ics-table').html(compiled);
        },

        downloadTableICS: function(e){
            var table = this.$('#ics209 table:last');
            var type = $(e.target).data('type');
            if (type === undefined){
                type = $(e.target).parent().data('type');
            }
            var name = webgnome.model.get('name') ? webgnome.model.get('name') + ' ICS 209' : 'ICS 209';
            var filename = name + '.' + type;
            var content = '';

            switch(type){
                case 'csv':
                    content = this.tableToCSV(table);
                    break;
                case 'html':
                    content = this.tableToHTML(table);
                    break;
            }

            var pom = document.createElement('a');
            pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
            pom.setAttribute('download', filename);
            pom.click();
        },

        printTableICS: function(){
            window.print();
        },

        tableToCSV: function(table, header){
            var csv = [];
            var rows = table.find('tr');
            rows.each(function(row){
                var csv_row = [];
                var cells = $(rows[row]).find('th, td');
                cells.each(function(cell){
                    csv_row.push($(cells[cell]).text());
                });
                csv.push(csv_row.join(','));
            });

            if(!_.isUndefined(header)){
                var cols = csv[0].split(',').length;
                header.each(function(row){
                    var cells = $(header[row]).text().split(':');
                    var csv_row = [cells[0] + ':', cells[1]];

                    for(var i = 0; i < cols.length - cells.length; i++){
                        csv_row.push(' ');
                    }
                    csv.unshift(csv_row.join(','));
                });
            }
            return csv.join('\r\n');
        },

        convertUnixToDateTimeCSV: function(datarow) {
            var datarowcp = datarow.slice();
            var unix = datarow[0] / 1000;
            var date = moment.unix(unix).toISOString();
            datarowcp[0] = date;
            return datarowcp;
        },

        exportCSV: function() {
            var tabName = this.$('.tab-pane.active').attr('id');
            var dataUnits = this.$('.tab-pane.active .yaxisLabel').html();
            var datasetName = this.tabToLabelMap[tabName];
            var dataset = this.pluckDataset(webgnome.mass_balance, [datasetName])[0];
            var dataArr = dataset.data;
            var filename = webgnome.model.get('name') + '_' + tabName;
            var header = "datetime,nominal(" + dataUnits + "),high(" + dataUnits + "),low(" + dataUnits + ")";
            var csv = [header];

            for (var i = 0; i < dataArr.length; i++) {
                var datasetrow = this.convertUnixToDateTimeCSV(dataArr[i]);
                datasetrow.splice(2,1);
                var row = datasetrow.join(",");
                csv.push(row);
            }

            csv = encodeURI('data:text/csv;charset=utf-8,' + csv.join('\r\n'));

            var pom = document.createElement('a');
            pom.setAttribute('href', csv);
            pom.setAttribute('download', filename + '.csv');
            pom.click();
        },

        tableToHTML: function(table, header){
            if(_.isUndefined(header)){
                header = '';
            }
            return _.template(ExportTemplate, {body: header.replace(/°/g, '') + '<table class="table table-striped">' + table.html() + '</table>'});
        },

        validateDataset: function() {
            if (this.dataset) {
                return this.dataset[0].data.length === webgnome.cache.length;
            }
            return true;
        },

        buildDataset: function(step){
            if(_.has(step.get('WeatheringOutput'), 'nominal')){
                this.formatStep(step);
                if(this.validateDataset()){
                    webgnome.cache.step();
                    this.frame++;
                    this.renderGraphs();
                } else {
                    webgnome.cache.off('step:recieved', this.buildDataset, this);
                    delete this.dataset;
                    this.frame = 0;
                    this.load();
                }
            } else {
                swal({
                    title: 'Model Output Error',
                    text: 'No weathering output was found for step #' + step.get('step_num'),
                    type: 'error'
                });
            }
        },

        formatStep: function(step){
            var nominal = step.get('WeatheringOutput').nominal;

            this.uncertainityExists = !_.isNull(step.get('WeatheringOutput').high);

            var high = _.isNull(step.get('WeatheringOutput').high) ? nominal : step.get('WeatheringOutput').high;
            var low = _.isNull(step.get('WeatheringOutput').low) ? nominal : step.get('WeatheringOutput').low;

            if(_.isUndefined(this.dataset)){
                this.dataset = [];
                var titles = _.clone(nominal);
                delete titles.step_num;
                delete titles.time_stamp;
                delete titles.floating;
                delete titles.natural_dispersion;
                delete titles.evaporated;
                delete titles.amount_released;
                delete titles.beached;
                delete titles.off_maps;
                var keys = Object.keys(titles);
                keys.unshift('amount_released', 'evaporated', 'natural_dispersion');
                // maybe add a check to see if the map is not a gnome map aka water world.
                // beach and off_maps wouldn't apply then.
                if (webgnome.model.get('mode') !== 'adios'){
                    keys.push('beached', 'off_maps');
                }

                keys.push('floating', 'water_density', 'water_viscosity', 'dispersibility_difficult', 'dispersibility_unlikely');

                for(var type in keys){
                    this.dataset.push({
                        data: [],
                        high: [],
                        low: [],
                        nominal: [],
                        label: this.formatLabel(keys[type]),
                        name: keys[type],
                        direction: {
                            show: false
                        },
                        needle: {
                            label: _.bind(this.formatNeedleLabel, this),
                            formatX: _.bind(this.formatNeedleTime, this)
                        }
                    });
                }
            }

            var date = moment(step.get('WeatheringOutput').time_stamp);
            var units = webgnome.model.get('spills').at(0).get('units');
            var api;
            if (_.isNull(webgnome.model.get('spills').at(0).get('element_type').get('substance'))){
                api = 10;
            } else {
                api = webgnome.model.get('spills').at(0).get('element_type').get('substance').get('api');
            }
            var converter = new nucos.OilQuantityConverter();
            var water = webgnome.model.get('environment').findWhere({'obj_type': 'gnome.environment.environment.Water'});
            var waterDensity = water.getDensity();

            for(var set in this.dataset){
                var low_value, nominal_value, high_value;
                if([
                        'natural_dispersion',
                        'chem_dispersed',
                        'evaporated',
                        'floating',
                        'amount_released',
                        'skimmed',
                        'burned',
                        'beached',
                        'sedimentation',
                        'dissolution',
                        'off_maps',
                        'observed_beached'
                    ].indexOf(this.dataset[set].name) !== -1){
                    var min = _.min(step.get('WeatheringOutput'), this.runIterator(set), this);
                    low_value = min[this.dataset[set].name];
                    low_value = converter.Convert(low_value, 'kg', api, 'API degree', units);

                    var max = _.max(step.get('WeatheringOutput'), this.runIterator(set), this);
                    high_value = max[this.dataset[set].name];
                    high_value = converter.Convert(high_value, 'kg', api, 'API degree', units);

                    nominal_value = nominal[this.dataset[set].name];
                    nominal_value = converter.Convert(nominal_value, 'kg', api, 'API degree', units);
                }  else if (this.dataset[set].name === 'avg_viscosity') {
                    // Converting viscosity from m^2/s to cSt before assigning the values to be graphed
                    low_value = nucos.convert('Kinematic Viscosity', 'm^2/s', 'cSt', low[this.dataset[set].name]);
                    nominal_value = nucos.convert('Kinematic Viscosity', 'm^2/s', 'cSt', nominal[this.dataset[set].name]);
                    high_value = nucos.convert('Kinematic Viscosity', 'm^2/s', 'cSt', high[this.dataset[set].name]);

                } else if (this.dataset[set].name === 'water_content'){
                    // Convert water content into a % it's an easier unit to understand
                    // and graphs better
                    low_value = low[this.dataset[set].name] * 100;
                    nominal_value = nominal[this.dataset[set].name] * 100;
                    high_value = high[this.dataset[set].name] * 100;
                } else if (this.dataset[set].name === 'water_density'){
                    low_value = waterDensity;
                    nominal_value = waterDensity;
                    high_value = waterDensity;
                } else if (this.dataset[set].name === 'water_viscosity'){
                    low_value = 1;
                    nominal_value = 1;
                    high_value = 1;
                } else if (this.dataset[set].name === 'dispersibility_difficult'){
                    low_value = 2000;
                    nominal_value = 2000;
                    high_value = 2000;
                } else if (this.dataset[set].name === 'dispersibility_unlikely'){
                    low_value = 10000;
                    nominal_value = 10000;
                    high_value = 10000;
                } else {
                    low_value = low[this.dataset[set].name];
                    nominal_value = nominal[this.dataset[set].name];
                    high_value = high[this.dataset[set].name];
                }

                
                this.dataset[set].high.push([date.unix() * 1000, high_value]);
                this.dataset[set].low.push([date.unix() * 1000, low_value]);
                this.dataset[set].data.push([date.unix() * 1000, nominal_value, 0, low_value, high_value]);
                this.dataset[set].nominal.push([date.unix() * 1000, nominal_value]);
                webgnome.mass_balance = this.dataset;
            }
        },

        runIterator: function(set){
            return (function(run){
                if (!_.isNull(run)){
                    return run[this.dataset[set].name];
                }
            });
        },

        formatNeedleLabel: function(text){
            var num = parseFloat(parseFloat(text).toPrecision(this.dataPrecision)).toString();
            var units = $('#weatherers .tab-pane:visible .yaxisLabel').text();
            return num + ' ' + units;
        },

        formatNeedleTime: function(text){
            var unix_time = parseInt(text, 10);

            return moment(unix_time).format(webgnome.config.date_format.moment);
        },

        pruneDataset: function(dataset, leaves){
            return _.filter(dataset, function(set){
                return leaves.indexOf(set.name) === -1;
            });
        },

        pluckDataset: function(dataset, leaves){
            return _.filter(dataset, function(set){
                return leaves.indexOf(set.name) !== -1;
            });
        },

        formatLabel: function(label){
            return label.charAt(0).toUpperCase() + label.slice(1).replace(/_/g, ' ');
        },

        formatNumber: function(number){
            return parseFloat(number.toPrecision(this.dataPrecision));
        },

        /**
         * Calculate the amount of oil released given the release start and end time in relation to the models end time.
         * @param  {Collection} spills  Collection of spill objects
         * @param  {Object} model       gnome model object
         * @return {Integer}            Amount of oil released in the models time period, same unit as spill.
         */
        calcAmountReleased: function(spills, model){
            var init_release = this.findInitialRelease(spills);
            var total_amount = 0;
            spills.forEach(_.bind(function(spill){
                var release_time = moment(spill.get('release').get('release_time')).unix();
                if(init_release > release_time){
                    init_release = release_time;
                }

                var amount = spill.get('amount');
                var release_start = moment(spill.get('release').get('release_time')).unix();
                var release_end = moment(spill.get('release').get('end_release_time')).unix();
                if(release_start === release_end){
                    release_end += 2;
                }
                var model_end = moment(model.get('start_time')).add(model.get('duration'), 's').unix();

                // find the rate of the release per second.
                var release_duration = release_end - release_start;
                var release_per_second = amount / release_duration;

                // find the percentage of the release time that fits in the model 
                var release_run_time;
                if (model_end > release_end){
                    release_run_time = release_duration;
                } else {
                    var overlap = release_end - model_end;
                    release_run_time = release_duration - overlap;
                }

                total_amount += release_run_time * release_per_second;
            }, this));
            return total_amount;
        },

        findInitialRelease: function(spills){
            var release_init = moment(spills.at(0).get('release').get('release_time')).unix();
            spills.forEach(function(spill){
                var release_start = moment(spill.get('release').get('release_time')).unix();
                if(release_start < release_init){
                    release_init = release_start;
                }
            });

            return release_init;
        },

        saveGraphImage: function(e){
            var element = this.$('.tab-pane.active .timeline').get();
            html2canvas(element, {
                onrendered: _.bind(function(canvas){
                    var ctx = canvas.getContext('2d');
                    var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    var compositeOperation = ctx.globalCompositeOperation;
                    ctx.globalCompositeOperation = 'destination-over';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    var img = canvas.toDataURL('image/png');

                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.putImageData(data, 0, 0);
                    ctx.globalCompositeOperation = compositeOperation;

                    var currentTab = this.$('.tab-pane.active').attr('id');
                    var name = webgnome.model.get('name') ? webgnome.model.get('name') + ' ' + currentTab : currentTab;
                    var pom = document.createElement('a');
                    pom.setAttribute('href', img);
                    pom.setAttribute('download', name);
                    pom.click();
                }, this)
            });
        },

        printGraphImage: function(e){
            window.print();
        },

        close: function(){
            $('.xdsoft_datetimepicker').remove();
            $(window).off('scroll', this.tableOilBudgetStickyHeader);
            webgnome.cache.off('step:recieved', this.buildDataset, this);
            webgnome.cache.off('rewind', this.reset, this);

            this.rendered = false;
            Backbone.View.prototype.close.call(this);
        }
    });

    return fateView;
});
