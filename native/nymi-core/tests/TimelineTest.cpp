#include "nymi/Timeline.hpp"
#include <cmath>
#include <cstdlib>
#include <limits>
#include <stdexcept>
#include <vector>

int main() {
    using namespace nymi;
    const std::vector<Keyframe> keys{{0.0,0.0},{1.0,10.0},{2.0,20.0}};
    auto check = [](bool condition) { if (!condition) std::abort(); };
    check(evaluateTrack(keys, -1.0) == 0.0);
    check(evaluateTrack(keys, 3.0) == 20.0);
    check(evaluateTrack(keys, 0.5) == 5.0);
    check(evaluateTrack(keys, 1.5, Interpolation::Step) == 10.0);
    check(evaluateTrack(keys, 1.5, Interpolation::Linear) == 15.0);
    bool rejected = false;
    try { (void)evaluateTrack({{1,1},{1,2}}, 1); }
    catch (const std::invalid_argument&) { rejected = true; }
    check(rejected);
    rejected = false;
    try { (void)evaluateTrack(keys, std::numeric_limits<double>::quiet_NaN()); }
    catch (const std::invalid_argument&) { rejected = true; }
    check(rejected);
}
