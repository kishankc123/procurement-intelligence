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
declare module 'planning/PlanningCard' {
  const PlanningCard: React.ComponentType<{ projectId: string }>
  export default PlanningCard
}
declare module 'planning/PlanProposalCard' {
  const PlanProposalCard: React.ComponentType<{ proposal: { plan: Omit<import('@pi/data').Plan, 'id' | 'project_id'>; basis: { sample_size: number; projects: string[]; median_total_days: number; filtered_by: string }; deadline?: { fits: boolean; spare_days?: number; days_over?: number } } }>
  export default PlanProposalCard
}
declare module 'monitoring/MonitoringCard' {
  const MonitoringCard: React.ComponentType<{ projectId: string }>
  export default MonitoringCard
}
declare module 'learning/LearningCard' {
  const LearningCard: React.ComponentType<{ projectId: string }>
  export default LearningCard
}
