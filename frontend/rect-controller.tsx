import {MemoRect} from './rect';
import {DraggableCore, DraggableEvent, DraggableData} from 'react-draggable';
import type {Replicache} from 'replicache';
import type {M} from './mutators';
import type {UndoManager} from '@rocicorp/undo';
import type {Shape} from './shape';
import React from 'react';
import isEqual from 'lodash/isEqual';
import {shallowEqual} from '../util/json';
// TODO: In the future I imagine this becoming ShapeController and
// there also be a Shape that wraps Rect and also knows how to draw Circle, etc.
export function RectController({
  rep,
  shape,
  undoManager,
}: {
  rep: Replicache<M>;
  shape: Shape;
  undoManager: UndoManager;
}) {
  const {id} = shape;
  const onMouseEnter = async () =>
    rep.mutate.overShape({clientID: await rep.clientID, shapeID: id});
  const onMouseLeave = async () =>
    rep.mutate.overShape({clientID: await rep.clientID, shapeID: ''});

  const onDragStart = (_e: DraggableEvent, _d: DraggableData) => {
    // Can't mark onDragStart async because it changes return type and onDragStart
    // must return void.
    undoManager.startGroup();
    void (async () =>
      rep.mutate.selectShape({
        clientID: await rep.clientID,
        shapeID: id,
      }))();
  };
  const onDrag = (e: DraggableEvent, d: DraggableData) => {
    // This is subtle, and worth drawing attention to:
    // In order to properly resolve conflicts, what we want to capture in
    // mutation arguments is the *intent* of the mutation, not the effect.
    // In this case, the intent is the amount the mouse was moved by, locally.
    // We will apply this movement to whatever the state happens to be when we
    // replay. If somebody else was moving the object at the same moment, we'll
    // then end up with a union of the two vectors, which is what we want!
    void rep.mutate.moveShape({
      id,
      dx: d.deltaX,
      dy: d.deltaY,
      animate: true,
    });
    void undoManager.add({
      undo: () =>
        rep.mutate.moveShape({
          id,
          dx: -d.deltaX,
          dy: -d.deltaY,
          animate: false,
        }),
      redo: () =>
        rep.mutate.moveShape({
          id,
          dx: d.deltaX,
          dy: d.deltaY,
          animate: false,
        }),
    });
  };
  const onDragStop = (_e: DraggableEvent, _d: DraggableData) => {
    undoManager.endGroup();
  };

  if (!shape) {
    return null;
  }

  return (
    <DraggableCore onStart={onDragStart} onDrag={onDrag} onStop={onDragStop}>
      <div>
        <MemoRect
          {...{
            rep,
            shape,
            highlight: false,
            onMouseEnter,
            onMouseLeave,
          }}
        />
      </div>
    </DraggableCore>
  );
}

export const MemoRectController = React.memo(RectController, (prev, next) => {
  return (
    isEqual(prev.shape, next.shape) &&
    shallowEqual({...prev, shape: undefined}, {...next, shape: undefined})
  );
});
