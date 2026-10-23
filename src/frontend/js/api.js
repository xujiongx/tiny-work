(function (WB) {
  function messageOf(error) {
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string' && error.message) return error.message;
    return '操作没有完成，请再试一次。';
  }

  WB.api = {
    async call(method, params, options) {
      const opts = options || {};
      try {
        return await tiny.api.call(method, params || {});
      } catch (error) {
        const message = messageOf(error);
        if (!opts.silent && WB.toast) WB.toast(message, { type: 'error' });
        const wrapped = new Error(message);
        wrapped.method = method;
        throw wrapped;
      }
    },

    on(event, handler) {
      return tiny.api.on(event, handler);
    },
  };
})(window.WB = window.WB || {});
