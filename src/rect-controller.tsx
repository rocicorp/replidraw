import { Rect } from "./rect";
import { DraggableCore, DraggableEvent, DraggableData } from "react-draggable";
import { Rep } from "./rep";
import { useShapeByID } from "./subscriptions";

// TODO: In the future I imagine this becoming ShapeController and
// there also be a Shape that wraps Rect and also knows how to draw Circle, etc.
export function RectController({ rep, id }: { rep: Rep; id: string }) {
  const shape = useShapeByID(rep, id);

  const onMouseEnter = () =>
    rep.mutate.overShape({ clientID: rep.cid, shapeID: id });
  const onMouseLeave = () =>
    rep.mutate.overShape({ clientID: rep.cid, shapeID: "" });

  const onDragStart = (e: DraggableEvent, d: DraggableData) => {
    rep.mutate.selectShape({ clientID: rep.cid, shapeID: id });
  };
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const onDrag = (e: DraggableEvent, d: DraggableData) => {
    // This is subtle, and worth drawing attention to:
    // In order to properly resolve conflicts, what we want to capture in
    // mutation arguments is the *intent* of the mutation, not the effect.
    // In this case, the intent is the amount the mouse was moved by, locally.
    // We will apply this movement to whatever the state happens to be when we
    // replay. If somebody else was moving the object at the same moment, we'll
    // then end up with a union of the two vectors, which is what we want!
    rep.mutate.moveShape({
      id,
      dx: d.deltaX,
      dy: d.deltaY,
    });
  };
  const onMouseWheel = (e: React.WheelEvent) => {
    rep.mutate.adjustOpacity({ id, delta: e.deltaY * 0.01 });
  };

  if (!shape) {
    return null;
  }

  return (
    <DraggableCore onStart={onDragStart} onDrag={onDrag}>
      <div onWheel={onMouseWheel} onClick={onClick}>
        <Rect
          {...{
            rep,
            id,
            highlight: false,
            onMouseEnter,
            onMouseLeave,
          }}
        />
      </div>
    </DraggableCore>
  );
}
