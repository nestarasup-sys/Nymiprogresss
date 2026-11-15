#pragma once
#include <vector>
namespace nymi {
    struct Keyframe {
        double timeSeconds{};
        double value{};
    };
    enum class Interpolation { Step, Linear };
    double evaluateTrack(const std::vector<Keyframe>& keys,
                         double timeSeconds,
                         Interpolation interpolation = Interpolation::Linear);
}
