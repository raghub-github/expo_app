const React = require("react");
const { View, Text } = require("react-native");

function MapView({ style, children }) {
  return React.createElement(
    View,
    { style: [{ flex: 1, backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center" }, style] },
    React.createElement(Text, { style: { color: "#6b7280" } }, "Map not available on web"),
    children
  );
}

function Circle() { return null; }
function Marker() { return null; }
function Polyline() { return null; }
function Polygon() { return null; }
function Callout() { return null; }

MapView.Animated = MapView;

module.exports = MapView;
module.exports.default = MapView;
module.exports.Circle = Circle;
module.exports.Marker = Marker;
module.exports.Polyline = Polyline;
module.exports.Polygon = Polygon;
module.exports.Callout = Callout;
