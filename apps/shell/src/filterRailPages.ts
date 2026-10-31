/** The home page, the assistant page and the chat have no filters: they explain the system and talk to it. Every other page (planning, tender design, monitoring, learning...) has the filter rail. */
const WITHOUT_FILTERS = ['/', '/assistant', '/chat']
export const hasFilterRail = (pathname: string) => !WITHOUT_FILTERS.includes(pathname.replace(/(.)\/+$/, '$1'))
