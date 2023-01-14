import React, {MouseEventHandler, TouchEventHandler} from 'react';
import type {Replicache} from 'replicache';
import type {M} from './mutators';
import type {Shape} from './shape';
import {useShape} from './smoothie';
import isEqual from 'lodash/isEqual';
import isEqualWith from 'lodash/isEqualWith';

export function Rect({
  rep,
  shape,
  highlight = false,
  highlightColor = 'rgb(74,158,255)',
  onMouseDown,
  onTouchStart,
  onMouseEnter,
  onMouseLeave,
}: {
  rep: Replicache<M>;
  shape: Shape;
  highlight?: boolean | undefined;
  highlightColor?: string | undefined;
  onMouseDown?: MouseEventHandler | undefined;
  onTouchStart?: TouchEventHandler | undefined;
  onMouseEnter?: MouseEventHandler | undefined;
  onMouseLeave?: MouseEventHandler | undefined;
}) {
  if (!shape) {
    return null;
  }
  const coords = useShape(rep, shape.id);
  if (!coords) {
    return null;
  }

  const {x, y, w, h, r} = coords;
  const enableEvents =
    onMouseDown || onTouchStart || onMouseEnter || onMouseLeave;

  return (
    // @ts-expect-error @types/react-dom is too old to be correct
    <svg
      {...{
        style: {
          position: 'absolute',
          left: -1,
          top: -1,
          transform: `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`,
          pointerEvents: enableEvents ? 'all' : 'none',
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
          strokeWidth: highlight ? '2px' : '0',
          stroke: highlightColor,
          width: w,
          height: h,
          fill: highlight ? 'none' : shape.fill,
        }}
      />
    </svg>
  );
}

export const MemoRect = React.memo(Rect, (prev, next) => {
  return (
    isEqual(prev.shape, next.shape) &&
    isEqualWith(
      {
        ...prev,
        shape: undefined,
        onMouseEnter: undefined,
        onMouseLeave: undefined,
      },
      {
        ...next,
        shape: undefined,
        onMouseEnter: undefined,
        onMouseLeave: undefined,
      },
      (a, b) => a === b,
    )
  );
});
