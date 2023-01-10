import React, {useRef, useState} from 'react';
import {MemoRect} from './rect';
import {HotKeys} from 'react-hotkeys';
import {Collaborator} from './collaborator';
import {MemoRectController} from './rect-controller';
import {touchToMouse} from './events';
import {Selection} from './selection';
import {DraggableCore} from 'react-draggable';
import {
  useShapes,
  useCollaboratorIDs,
  useOverShape,
  useSelectedShape,
} from './subscriptions';
import type {Replicache} from 'replicache';
import type {M} from './mutators';
import type {UndoManager} from '@rocicorp/undo';

export function Designer({
  rep,
  undoManager,
}: {
  rep: Replicache<M>;
  undoManager: UndoManager;
}) {
  const shapes = useShapes(rep);
  const shapeMap = new Map(shapes.map(s => [s.id, s]));
  const overShape = useOverShape(rep);
  const selectedShape = useSelectedShape(rep);
  const collaboratorIDs = useCollaboratorIDs(rep);

  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const move = async (dx = 0, dy = 0, animate = true) => {
    if (selectedShape) {
      await rep.mutate.moveShape({id: selectedShape.id, dx, dy, animate});
    }
  };

  const handlers = {
    moveLeft: () => {
      void move(-20, 0);
      void undoManager.add({
        redo: () => move(-20, 0, false),
        undo: () => move(20, 0, false),
      });
    },
    moveRight: () => {
      void move(20, 0);
      void undoManager.add({
        redo: () => move(20, 0, false),
        undo: () => move(-20, 0, false),
      });
    },
    moveUp: () => {
      void move(0, -20);
      void undoManager.add({
        redo: () => move(0, -20, false),
        undo: () => move(0, 20, false),
      });
    },
    moveDown: () => {
      void move(0, 20);
      void undoManager.add({
        redo: () => move(0, 20, false),
        undo: () => move(0, -20, false),
      });
    },
    deleteShape: (e?: KeyboardEvent) => {
      // Prevent navigating backward on some browsers.
      e && e.preventDefault();
      const shapeBeforeDelete = selectedShape;
      if (!shapeBeforeDelete) {
        return;
      }
      const deleteShape = () => rep.mutate.deleteShape(selectedShape.id);
      const createShape = () => rep.mutate.createShape(shapeBeforeDelete);

      void undoManager.add({
        execute: deleteShape,
        undo: createShape,
      });
    },
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
  };

  const onMouseMove = async ({
    pageX,
    pageY,
  }: {
    pageX: number;
    pageY: number;
  }) => {
    if (ref && ref.current) {
      void rep.mutate.setCursor({
        id: await rep.clientID,
        x: pageX,
        y: pageY - ref.current.offsetTop,
      });
    }
  };

  return (
    <HotKeys
      {...{
        style: {outline: 'none', display: 'flex', flex: 1},
        keyMap,
        handlers,
      }}
    >
      <DraggableCore
        onStart={() => setDragging(true)}
        onStop={() => setDragging(false)}
      >
        <div
          {...{
            ref,
            style: {
              position: 'relative',
              display: 'flex',
              flex: 1,
              overflow: 'hidden',
            },
            onMouseMove,
            onTouchMove: e => touchToMouse(e, onMouseMove),
          }}
        >
          {shapes.map(shape => (
            // draggable rects
            <MemoRectController
              {...{
                key: `shape-${shape.id}`,
                rep,
                shape,
                undoManager,
              }}
            />
          ))}

          {
            // self-highlight
            !dragging && overShape && (
              <MemoRect
                {...{
                  key: `highlight-${overShape.id}`,
                  rep,
                  shape: overShape,
                  highlight: true,
                }}
              />
            )
          }

          {
            // self-selection
            selectedShape && (
              <Selection
                {...{
                  key: `selection-${selectedShape.id}`,
                  rep,
                  shape: selectedShape,
                  highlight: true,
                  containerOffsetTop: ref.current && ref.current.offsetTop,
                  undoManager,
                }}
              />
            )
          }

          {
            // collaborators
            // foreignObject seems super buggy in Safari, so instead we do the
            // text labels in an HTML context, then do collaborator selection
            // rectangles as their own independent svg content. Le. Sigh.
            collaboratorIDs.map(id => (
              <Collaborator
                {...{
                  key: `key-${id}`,
                  rep,
                  clientID: id,
                  shapeMap,
                }}
              />
            ))
          }
        </div>
      </DraggableCore>
    </HotKeys>
  );
}

const keyMap = {
  moveLeft: ['left', 'shift+left'],
  moveRight: ['right', 'shift+right'],
  moveUp: ['up', 'shift+up'],
  moveDown: ['down', 'shift+down'],
  deleteShape: ['del', 'backspace'],
  undo: ['ctrl+z', 'command+z'],
  redo: ['ctrl+y', 'command+shift+z'],
};
