import React, { useState } from "react";
import { Todo } from "./todo";
import Footer from "./footer";
import TodoList from "./todo-list";

const MainSection = ({
  todos,
  onUpdateTodo,
  onCompleteTodo,
  onDeleteTodos,
  onCompleteTodos,
}: {
  todos: Todo[];
  onUpdateTodo: (id: string, text: string) => void;
  onCompleteTodo: (id: string, completed: boolean) => void;
  onDeleteTodos: (ids: string[]) => void;
  onCompleteTodos: (args: { completed: boolean; ids: string[] }) => void;
}) => {
  const todosCount = todos.length;
  const completed = todos.filter((todo) => todo.completed);
  const completedCount = completed.length;
  const toggleAllValue = completedCount === todosCount;

  const [filter, setFilter] = useState("All");

  const filteredTodos = todos.filter((todo) => {
    if (filter === "All") {
      return true;
    }
    if (filter === "Active") {
      return !todo.completed;
    }
    if (filter === "Completed") {
      return todo.completed;
    }
    throw new Error("Unknown filter: " + filter);
  });

  const handleCompleteAll = () => {
    const completed = !toggleAllValue;
    onCompleteTodos({
      completed,
      ids: todos.map((todo) => todo.id),
    });
  };

  return (
    <section className="main">
      {todosCount > 0 && (
        <span>
          <input
            className="toggle-all"
            type="checkbox"
            defaultChecked={toggleAllValue}
          />
          <label onClick={handleCompleteAll} />
        </span>
      )}
      <TodoList
        todos={filteredTodos}
        onUpdateTodo={onUpdateTodo}
        onCompleteTodo={onCompleteTodo}
        onDeleteTodo={(id) => onDeleteTodos([id])}
      />
      {todos.length > 0 && (
        <Footer
          completed={completedCount}
          active={todosCount - completedCount}
          onDeleteCompleted={() =>
            onDeleteTodos(completed.map((todo) => todo.id))
          }
          currentFilter={filter}
          onFilter={setFilter}
        />
      )}
    </section>
  );
};

export default MainSection;
