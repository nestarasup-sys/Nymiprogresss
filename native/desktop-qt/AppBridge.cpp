#include "AppBridge.hpp"
#include "nymi/Timeline.hpp"

AppBridge::AppBridge(QObject* parent) : QObject(parent) {}
double AppBridge::sampleNormalizedPosition(double seconds) const {
    const std::vector<nymi::Keyframe> keys{{0, 0.0}, {1, 0.15}, {2, 0.72}, {3, 1.0}};
    return nymi::evaluateTrack(keys, seconds);
}
