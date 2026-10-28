/// <reference types="vite/client" />
declare module 'planning/Planning' {
  const Planning: React.ComponentType
  export default Planning
}
declare module 'monitoring/Monitoring' {
  const Monitoring: React.ComponentType
  export default Monitoring
}
declare module 'learning/Learning' {
  const Learning: React.ComponentType
  export default Learning
}
declare module 'ai/WorkWithAI' {
  const WorkWithAI: React.ComponentType
  export default WorkWithAI
}
declare module 'monitoring/ScheduleCard' {
  const ScheduleCard: React.ComponentType<{ project: import('@pi/data').Project; badge?: React.ReactNode; footer?: React.ReactNode }>
  export default ScheduleCard
}
