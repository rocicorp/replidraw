import React, { useRef, useState } from "react";
import { Rect } from "./rect";
import { HotKeys } from "react-hotkeys";
import { Collaborator } from "./collaborator";
import { RectController } from "./rect-controller";
import { touchToMouse } from "./events";
import { Selection } from "./selection";
import { DraggableCore } from "react-draggable";
import {
  useShapeIDs,
  useOverShapeID,
  useSelectedShapeID,
  useCollaboratorIDs,
} from "./subscriptions";
import { Replicache } from "replicache";
import { M } from "./mutators";
import type { UndoManager } from "@rocicorp/undo";
import { getShape, Shape } from "./shape";

export function Designer({
  rep,
  undoManager,
}: {
  rep: Replicache<M>;
  undoManager: UndoManager;
}) {
  const ids = useShapeIDs(rep);
  const overID = useOverShapeID(rep);
  const selectedID = useSelectedShapeID(rep);
  const collaboratorIDs = useCollaboratorIDs(rep);

  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const move = async (
    dx: number = 0,
    dy: number = 0,
    animate: boolean = true
  ) => {
    await rep.mutate.moveShape({ id: selectedID, dx, dy, animate });
  };

  const handlers = {
    moveLeft: () => {
      move(-20, 0);
      undoManager.add({
        redo: () => move(-20, 0, false),
        undo: () => move(20, 0, false),
      });
    },
    moveRight: () => {
      move(20, 0);
      undoManager.add({
        redo: () => move(20, 0, false),
        undo: () => move(-20, 0, false),
      });
    },
    moveUp: () => {
      move(0, -20);
      undoManager.add({
        redo: () => move(0, -20, false),
        undo: () => move(0, 20, false),
      });
    },
    moveDown: () => {
      move(0, 20);
      undoManager.add({
        redo: () => move(0, 20, false),
        undo: () => move(0, -20, false),
      });
    },
    deleteShape: async () => {
      // Prevent navigating backward on some browsers.
      event?.preventDefault();
      const shapeBeforeDelete = await rep.query((tx) =>
        getShape(tx, selectedID)
      );
      const deleteShape = () => rep.mutate.deleteShape(selectedID);
      const createShape = () => {
        rep.mutate.createShape(shapeBeforeDelete as Shape);
      };
      undoManager.add({
        execute: deleteShape,
        undo: createShape,
      });
    },
    undo: () => {
      undoManager.undo();
    },
    redo: () => {
      undoManager.redo();
    },
  };

  const onMouseMove = async ({
    pageX,
    pageY,
  }: {
    pageX: number;
    pageY: number;
  }) => {
    if (ref && ref.current) {
      rep.mutate.setCursor({
        id: await rep.clientID,
        x: pageX,
        y: pageY - ref.current.offsetTop,
      });
    }
  };

  return (
    <HotKeys
      {...{
        style: { outline: "none", display: "flex", flex: 1 },
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
              position: "relative",
              display: "flex",
              flex: 1,
              overflow: "hidden",
            },
            onMouseMove,
            onTouchMove: (e) => touchToMouse(e, onMouseMove),
          }}
        >
          {ids.map((id) => (
            // draggable rects
            <RectController
              {...{
                key: `shape-${id}`,
                rep,
                id,
                undoManager,
              }}
            />
          ))}

          {
            // self-highlight
            !dragging && overID && (
              <Rect
                {...{
                  key: `highlight-${overID}`,
                  rep,
                  id: overID,
                  highlight: true,
                }}
              />
            )
          }

          {
            // self-selection
            selectedID && (
              <Selection
                {...{
                  key: `selection-${selectedID}`,
                  rep,
                  id: selectedID,
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
            collaboratorIDs.map((id) => (
              <Collaborator
                {...{
                  key: `key-${id}`,
                  rep,
                  clientID: id,
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
  moveLeft: ["left", "shift+left"],
  moveRight: ["right", "shift+right"],
  moveUp: ["up", "shift+up"],
  moveDown: ["down", "shift+down"],
  deleteShape: ["del", "backspace"],
  undo: ["ctrl+z", "command+z"],
  redo: ["ctrl+y", "command+shift+z"],
};
