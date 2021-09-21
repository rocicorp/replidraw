import React from "react";
import { Rep } from "./rep";
import { useDrawByID } from "./subscriptions";

export function Dot({ rep, id }: { rep: Rep; id: string }) {
  const draw = useDrawByID(rep, id);
  if (!draw) {
    return null;
  }

  const { cx, cy, radius, color } = draw;

  return (
    <svg
      {...{
        style: {
          position: "absolute",
          left: -1,
          top: -1,
          transform: `translate3d(${cx - radius}px, ${cy - radius}px, 0)`,
          pointerEvents: "none",
        },
        width: radius * 2,
        height: radius * 2,
      }}
    >
      <circle cx={radius} cy={radius} r={radius} fill={color} />
    </svg>
  );
}
