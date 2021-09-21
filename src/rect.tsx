import React, { MouseEventHandler, TouchEventHandler } from "react";
import { Rep } from "./rep";
import { useShapeByID, useShapeIDs } from "./subscriptions";

export function Rect({
  rep,
  id,
  highlight = false,
  highlightColor = "rgb(74,158,255)",
  onMouseDown,
  onTouchStart,
  onMouseEnter,
  onMouseLeave,
}: {
  rep: Rep;
  id: string;
  highlight?: boolean;
  highlightColor?: string;
  onMouseDown?: MouseEventHandler;
  onTouchStart?: TouchEventHandler;
  onMouseEnter?: MouseEventHandler;
  onMouseLeave?: MouseEventHandler;
}) {
  const shape = useShapeByID(rep, id);
  if (!shape) {
    return null;
  }

  const { x, y, width: w, height: h, rotate: r } = shape;
  const enableEvents =
    onMouseDown || onTouchStart || onMouseEnter || onMouseLeave;

  return (
    <svg
      {...{
        style: {
          position: "absolute",
          left: -1,
          top: -1,
          transform: `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`,
          pointerEvents: enableEvents ? "all" : "none",
        },
        width: w + 2,
        height: h + 2,
        onMouseDown,
        onTouchStart,
        onMouseEnter,
        onMouseLeave,
      }}
    >
      <rect
        {...{
          x: 1, // To make room for stroke
          y: 1,
          strokeWidth: highlight ? "2px" : "0",
          stroke: highlightColor,
          width: w,
          height: h,
          fill: highlight ? "none" : shape.fill,
        }}
      />
    </svg>
  );
}
