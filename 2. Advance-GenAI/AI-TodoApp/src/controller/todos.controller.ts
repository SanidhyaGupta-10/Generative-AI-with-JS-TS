import { eq } from 'drizzle-orm';
import { db } from '../../db/index'
import { todosTable } from '../../db/schema'

type Todo = {
    todo: string;
    isCompleted: boolean;
}

async function addTodo({ todo, isCompleted = false }: Todo) {
    await db.insert(todosTable).values({
        todo,
        isCompleted,
    });
};

async function deleteTodo(id: any){
    const removeTodo = await db.delete(todosTable).where(id);
    return removeTodo;
};

async function toggleTodo(id: any) {
    const result = await db.update(todosTable)
       .set({ isCompleted: true })
       .where(eq(todosTable.id, id)); 
        // Note: Drizzle usually requires eq() for the where clause
    return result;
}

async function searchTodo(search: any){
    const todos = db.select().from(todosTable)
        .where(eq(todosTable.todo, search));
    return todos; 
}

async function getAllTodos(){
    const todos = db.select().from(todosTable);
    console.log(todos);
    return todos;
};

export {
    addTodo,
    deleteTodo,
    toggleTodo,
    searchTodo,
    getAllTodos,
}
