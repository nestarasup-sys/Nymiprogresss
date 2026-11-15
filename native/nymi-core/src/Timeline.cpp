#include "nymi/Timeline.hpp"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace nymi {
double evaluateTrack(const std::vector<Keyframe>& keys,
                     double timeSeconds,
                     Interpolation interpolation) {
    if (!std::isfinite(timeSeconds)) throw std::invalid_argument("Non-finite time");
    if (keys.empty()) throw std::invalid_argument("Track cannot be empty");
    for (std::size_t i = 0; i < keys.size(); ++i) {
        if (!std::isfinite(keys[i].timeSeconds) || !std::isfinite(keys[i].value))
            throw std::invalid_argument("Keyframe contains non-finite value");
        if (i && keys[i - 1].timeSeconds >= keys[i].timeSeconds)
            throw std::invalid_argument("Keyframes must have strictly increasing times");
    }
    if (timeSeconds <= keys.front().timeSeconds) return keys.front().value;
    if (timeSeconds >= keys.back().timeSeconds) return keys.back().value;
    const auto upper = std::upper_bound(keys.begin(), keys.end(), timeSeconds,
        [](double t, const Keyframe& key) { return t < key.timeSeconds; });
    const auto& from = *(upper - 1);
    if (interpolation == Interpolation::Step) return from.value;
    const auto& to = *upper;
    const double alpha = (timeSeconds - from.timeSeconds) / (to.timeSeconds - from.timeSeconds);
    return from.value + alpha * (to.value - from.value);
}
}
