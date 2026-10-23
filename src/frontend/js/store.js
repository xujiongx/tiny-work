(function (WB) {
  const U = WB.util;

  WB.store = {
    state: {
      view: 'today',
      date: U.todayKey(),
      projects: [],
      settings: {},
      counts: {
        entriesToday: 0,
        tasksOpen: 0,
        tasksDoneToday: 0,
        streak: 0,
      },
      dbPath: '',
      info: null,
      savedAt: null,
    },

    set(patch) {
      Object.assign(this.state, patch || {});
    },

    project(id) {
      return this.state.projects.find((project) => project.id === id) || null;
    },

    projectName(id) {
      const project = this.project(id);
      return project ? project.name : '';
    },
  };
})(window.WB = window.WB || {});
