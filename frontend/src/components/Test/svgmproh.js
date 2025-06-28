import React, { useState } from "react";
import { useSpring, animated } from "react-spring";
import { interpolate } from "d3-interpolate";

const SVGMorph = ({ svg1, svg2, duration = 1000 }) => {
  const [toggle, setToggle] = useState(true);

  const interpolator = interpolate(svg1, svg2);

  const { d } = useSpring({
    from: { d: svg1 },
    to: { d: toggle ? svg2 : svg1 },
    reset: true,
    reverse: toggle,
    onRest: () => setToggle(!toggle),
    config: { duration },
  }).d.to(interpolator);

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100">
      <animated.path d={d} />
    </svg>
  );
};

export default SVGMorph;
