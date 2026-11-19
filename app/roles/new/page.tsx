import NewRoleForm from './NewRoleForm';
export default function NewRole() {
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="page-head"><div><h1>New role from call notes</h1>
        <p className="muted">The copilot writes the job description from the call only. Anything unclear becomes “TBC” plus a question for the client — it never makes things up.</p></div></div>
      <NewRoleForm />
    </div>
  );
}
