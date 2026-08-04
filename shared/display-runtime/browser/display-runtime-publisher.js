(function installNeudDisplayRuntimePublisher(global) {
  if (global.__NEUD_DISPLAY_RUNTIME_PUBLISHER_INSTALLED__) {
    return;
  }
  global.__NEUD_DISPLAY_RUNTIME_PUBLISHER_INSTALLED__ = true;

  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";
  var NEUD_DISPLAY_SOURCE = "neud-display";
  var NEUD_DISPLAY_READY = "NEUD_DISPLAY_READY";

  function publishRuntimeSnapshot(runtime, snapshot, displayInfo) {
    if (!runtime) {
      return;
    }

    runtime._snapshot = snapshot;
    runtime._displayInfo = displayInfo || null;
    global.NEUD_DATA = snapshot;
    global.displayData = snapshot;

    try {
      global.dispatchEvent(new CustomEvent("neud:data", { detail: snapshot }));
    } catch (_) {}

    try {
      global.postMessage(
        {
          source: NEUD_RUNTIME_SOURCE,
          type: NEUD_DATA_UPDATE,
          version: 1,
          payload: snapshot,
          revision:
            displayInfo && displayInfo.revision != null ? displayInfo.revision : null,
        },
        global.location && global.location.origin ? global.location.origin : "*",
      );
    } catch (_) {}

    if (typeof global.updateDisplay === "function") {
      try {
        global.updateDisplay(snapshot);
      } catch (_) {}
    }

    if (Array.isArray(runtime._subscribers)) {
      for (var i = 0; i < runtime._subscribers.length; i++) {
        try {
          runtime._subscribers[i](snapshot);
        } catch (_) {}
      }
    }
  }

  function createNeudDisplayBridge() {
    return {
      _subscribers: [],
      _snapshot: null,
      _displayInfo: null,
      _ready: false,
      subscribe: function (callback) {
        this._subscribers.push(callback);
        if (this._snapshot) {
          callback(this._snapshot);
        }
        var self = this;
        return function () {
          self._subscribers = self._subscribers.filter(function (entry) {
            return entry !== callback;
          });
        };
      },
      getSnapshot: function () {
        return this._snapshot;
      },
      getDisplayInfo: function () {
        return this._displayInfo || null;
      },
      signalReady: function () {
        this._ready = true;
        var readyMessage = { source: NEUD_DISPLAY_SOURCE, type: NEUD_DISPLAY_READY };
        try {
          global.dispatchEvent(new CustomEvent("NEUD_DISPLAY_READY"));
        } catch (_) {}
        try {
          var hostedMode = global.__NEUD_DISPLAY_DATA_DISCONNECTED__ === true;
          var target = hostedMode && global.parent ? global.parent : global;
          var targetOrigin = "*";
          if (
            !hostedMode &&
            global.location &&
            global.location.origin &&
            global.location.origin !== "null"
          ) {
            targetOrigin = global.location.origin;
          }
          target.postMessage(readyMessage, targetOrigin);
        } catch (_) {}
      },
      _publish: function (snapshot, displayInfo) {
        publishRuntimeSnapshot(this, snapshot, displayInfo);
      },
    };
  }

  global.publishRuntimeSnapshot = publishRuntimeSnapshot;
  global.createNeudDisplayBridge = createNeudDisplayBridge;
})(typeof window !== "undefined" ? window : globalThis);
