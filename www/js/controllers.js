angular.module('c42-ionic.controllers', [])

.controller('HomeCtrl', ['$scope', 'config', 'local_settings', 'c42Api','calendarFilter', '$window', 'uiGmapGoogleMapApi', 'cfpLoadingBar', function($scope,config, local_settings, c42Api, calendarFilter, $window, uiGmapGoogleMapApi, cfpLoadingBar) {
  var options = {
    // As we want to show quite some markers on the map, this is now set to 100.
    // If the markers and events in the list are pulled of different API calls this could be set to 10
    // Also, we should move the client side filtering then to the API
    limit: 100,
    offset: 0
  };

  // Encharged to manage the scope and the options offset based on the parapms
  // events [array] : the list of events will be added/replaced in the scope
  // replace [boolean] : If this argument is true the events will be always replaced. If not will just be concatenated
  var setEvents = function(events, replace){
    $scope.$apply(function () {
      $scope.events = replace ? events : $scope.events.concat(events);
    });
    options.offset = $scope.events.length;
  }

  $scope.onclick = function (eventId) {
    var href="#/tab/event/" + eventId;
    $window.location.href = href;
  };

  $scope.events = [];
  $scope.mapConfig = config.initialConfig.mapDefaults;

  $scope.mapConfig.events = {

    'idle':function(){
      // Very first loading of the events, and every time the map is idle.
      c42Api.getEvents(options, function(events){
        setEvents(events,true);
      });
    },
    'bounds_changed': function(){
      // getting the polyline to be encoded and sent to get the events included in it
      var mapBounds = this.map.getBounds();
      var bounds = [
        // Nordth - West
        [
          this.map.getBounds().getNorthEast().lat(),
          this.map.getBounds().getSouthWest().lng()
        ],
        // Nordth - East
        [
          this.map.getBounds().getNorthEast().lat(),
          this.map.getBounds().getNorthEast().lng()
        ],
        // South - East
        [
          this.map.getBounds().getSouthWest().lat(),
          this.map.getBounds().getNorthEast().lng()
        ],// South - West
        [
          this.map.getBounds().getSouthWest().lat(),
          this.map.getBounds().getSouthWest().lng()
        ],
        // Nordth - West (closing the square)
        [
          this.map.getBounds().getNorthEast().lat(),
          this.map.getBounds().getSouthWest().lng()
        ]
      ];
      options.offset = 0;
      options.geo_polygons = "["+polyline.encode(bounds)+"]";
    }
  };
  // @TODO: Add this to the resolve in the way that is filtered before of being rendered
  // @TODO: Get it form the BE
  $scope.$on('$ionicView.enter', function() {
    if($scope.events.length){
      var filters = calendarFilter.getFilters();
      // Checking if the event contains any calendar that is selected in the "filter calendars"
      $scope.events.forEach(function(event,idx, eventsList){
        if(event.__calendars.length && filters.length){
          eventsList[idx].filtererdOut = event.__calendars.some(function(calendar){
            return !calendarFilter.inFilter(calendar.id);
          });
        }else{
          eventsList[idx].filtererdOut = false;
        }
      });
    }
  });

  $scope.doRefresh = function () {
    // @fixme: although we immediatly broadcast this, the arrow can still be briefly seen after loading
    $scope.$broadcast('scroll.refreshComplete');
    // Since we are refreshing form the bottom we set the offset of the options to 0
    options.offset = 0;
    c42Api.getEvents(options, function(events){
      setEvents(events,true);
    });
  };

  $scope.loadMore = function () {
    // We don't want to load with load More at the beginning when there is no events.
    // Only due user scroll.
    if(c42Api.getTotalEventsCount() && $scope.events.length && c42Api.getTotalEventsCount() > $scope.events.length){
      c42Api.getEvents(options, function(events){
        setEvents(events);
        // Notify that the infinite loading is complete
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
    }else{
      // Because this method will be called even if there is none, we stop it notifying
      $scope.$broadcast('scroll.infiniteScrollComplete');
    }
  };
  // As the infinite-scroll directive is already checking whether to load more, it will automaticaly load on entering the view
}])

.controller('InterestsCtrl', function($scope, c42Api, calendarFilter) {
  $scope.data = {
    badgeCount : 1
  };
  if(!$scope.calendars){
    c42Api.getCalendars(function(calendars){
      $scope.calendars = calendars;
      $scope.data = {
        badgeCount : calendars.length
      };
    });
  }

  $scope.inFilter = function(calendar_id){
    return calendarFilter.inFilter(calendar_id);
  };

  $scope.saveFilter = function(checked, calendar_id){
    if(checked){
      calendarFilter.addFilter(calendar_id);
    }else{
      calendarFilter.removeFilter(calendar_id);
    }
  };
})

.controller('EventDetailCtrl', ['$scope', '$stateParams', '$ionicScrollDelegate', '$ionicPopup', 'c42Api', 'local_settings', function($scope, $stateParams, $ionicScrollDelegate, $ionicPopup, c42Api, local_settings) {
  // Var used to know if certain element should be shown.
  // Used to know if the 'description' is shown.
  $scope.shownItem = null;
  $scope.isItemShown = function(item) {
    return $scope.shownItem === item;
  };
  $scope.toggleItem= function(item) {
    if ($scope.isItemShown(item)) {
      $scope.shownItem = null;
    } else {
      $scope.shownItem = item;
    }
  };
  // This method is required (and called) after toggle an element that increases/reduces the page length.
  // In that case the scroll is affected and needs to be re-calculated
  $scope.refreshScroll = function () {
    $ionicScrollDelegate.resize();
  };

  $scope.changeAttending = function() {
    $scope.attending = !$scope.attending;
    $scope.event.rsvp_status = $scope.attending ? 'attending' : 'not_attending';
    c42Api.updateEventFields($scope.event, ['rsvp_status'], function (resp) {
      console.warn(resp);
    });
  };

  // Method used when the user requests for showing the location in an external app, e.g: google maops
  $scope.openMaps = function(){
    var ref = window.open(this.mapsUrl, '_system', 'location=yes');
  }

  var _setEventScope = function () {
    c42Api.getEventById($stateParams.eventId, function (event) {
      $scope.event = event;
      $scope.attending = event.rsvp_status == 'attending';
      if (event.start_location.geo) {
        // @TODO: apply this solution despite different link should be called depending on whether you're on Android or iOS
        //        - https://gist.github.com/mrzmyr/977fc7d8bee58db9d96f
        $scope.mapsUrl = "http://maps.google.com/maps?q="+event.start_location.text.replace(/ /g,"+"); // Android
      }
      $scope.heroPicture = event.icon || "https://maps.googleapis.com/maps/api/staticmap?center="+event.start_location.geo.latitude+","+event.start_location.geo.longitude+"&zoom=18&size=400x400&maptype=satellite&key=" + local_settings.googleStaticMapsAPIKey;
      $scope.mapPicture = "https://maps.googleapis.com/maps/api/staticmap?markers=size:mid%7Ccolor:red%7C"+event.start_location.geo.latitude+","+event.start_location.geo.longitude+"&zoom=18&size=400x240&key=" + local_settings.googleStaticMapsAPIKey;
    });
  };

  $scope.showMailPopup = function () {
    $scope.data = {};

    var mailPopup = $ionicPopup.show({
      template: '<input type="text" ng-model="data.email">',
      title: 'Enter email',
      subTitle: 'Subscribe to event',
      scope: $scope,
      buttons: [
        { text: '<span style="font-size: .7em;">Cancel</span>' },
        {
          text: '<b style="font-size: .7em;">Save</b>',
          type: 'button-positive',
          onTap: function(e) {
            if (!$scope.data.email) {
              e.preventDefault();
            } else {
              var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
              if(!re.test($scope.data.email)){
                e.preventDefault();
                return false;
              }
              c42Api.createEventSubscription($scope.event, { "email": $scope.data.email }, function (err) {
                if (!err) {
                  console.warn("success");
                }
              });
              return $scope;
            }
          }
        }
      ]
    });
  };

  $scope.$on('$ionicView.afterEnter', function(){
    _setEventScope();
  });

}]);
