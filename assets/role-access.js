(function (window) {
  'use strict';

  const ROLE_ALIASES = {
    admin: 'admin',
    administrador: 'admin',
    taquilla: 'taquilla',
    taquillero: 'taquilla',
    cashier: 'taquilla',
    ticket: 'taquilla',
    boletos: 'taquilla',
    usuario: 'usuario',
    jugador: 'usuario',
    user: 'usuario',
    player: 'usuario'
  };
  const pendingRoleChecks = {};

  function normalizeRoleName(value) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return ROLE_ALIASES[normalized] || normalized;
  }

  function normalizeRoles(user) {
    if (!user) return [];

    const rawRoles = [];
    if (Array.isArray(user.roles)) {
      rawRoles.push(...user.roles);
    } else if (typeof user.roles === 'string') {
      rawRoles.push(...user.roles.split(','));
    }

    ['rol', 'role', 'tipo_usuario', 'perfil'].forEach((field) => {
      if (user[field]) rawRoles.push(user[field]);
    });

    const roles = rawRoles
      .map(normalizeRoleName)
      .filter(Boolean);

    return Array.from(new Set(roles));
  }

  function getLocalUser() {
    try {
      return JSON.parse(localStorage.getItem('much_google_user') || 'null');
    } catch (error) {
      console.warn('[Roles] No se pudo leer much_google_user:', error);
      return null;
    }
  }

  function getAccessInfo(user) {
    const roles = normalizeRoles(user);
    const hasAdminRole = roles.includes('admin');
    const hasTaquillaRole = roles.includes('taquilla');
    const primaryRole = hasAdminRole ? 'admin' : (hasTaquillaRole ? 'taquilla' : 'usuario');

    return {
      roles,
      primaryRole,
      hasAdminRole,
      hasTaquillaRole,
      isAdmin: primaryRole === 'admin',
      isTaquilla: primaryRole === 'taquilla',
      isPlayer: primaryRole === 'usuario',
      isInternal: primaryRole === 'admin' || primaryRole === 'taquilla'
    };
  }

  function normalizeBasePath(basePath) {
    if (!basePath) return '';
    return basePath.endsWith('/') ? basePath : `${basePath}/`;
  }

  function getRoleHome(role, basePath) {
    const prefix = normalizeBasePath(basePath);
    const normalizedRole = normalizeRoleName(role);

    if (normalizedRole === 'admin') return `${prefix}ADMINISTRADOR.html`;
    if (normalizedRole === 'taquilla') return `${prefix}ADMINISTRADOR.html?section=taquilla`;
    return `${prefix}index.html`;
  }

  function redirectToRoleHome(options) {
    const opts = options || {};
    const user = opts.user === undefined ? getLocalUser() : opts.user;
    const access = getAccessInfo(user);
    const target = opts.url || getRoleHome(access.primaryRole, opts.basePath);
    const targetUrl = new URL(target, window.location.href);

    if (targetUrl.href === window.location.href) {
      if (opts.reloadOnSame) window.location.reload();
      return false;
    }

    if (opts.replace === false) window.location.href = targetUrl.href;
    else window.location.replace(targetUrl.href);
    return true;
  }

  function getApiBase(options) {
    if (options?.apiBase) return options.apiBase;
    return window.location.hostname ? `http://${window.location.hostname}:3000` : 'http://127.0.0.1:3000';
  }

  function verifyRolesAndRedirectIfNeeded(user, options) {
    const opts = options || {};
    const userId = user?.id_usuario || user?.id;
    if (!userId || pendingRoleChecks[userId]) return;

    pendingRoleChecks[userId] = true;
    fetch(`${getApiBase(opts)}/api/usuarios/${userId}/roles`)
      .then((res) => {
        if (!res.ok) throw new Error('No se pudieron verificar los roles.');
        return res.json();
      })
      .then((data) => {
        const refreshedUser = {
          ...user,
          roles: Array.isArray(data.roles) ? data.roles : []
        };
        localStorage.setItem('much_google_user', JSON.stringify(refreshedUser));

        if (getAccessInfo(refreshedUser).isInternal) {
          redirectToRoleHome({
            user: refreshedUser,
            basePath: opts.basePath,
            replace: opts.replace
          });
        }
      })
      .catch((error) => {
        console.warn('[Roles] No se pudieron verificar roles en backend:', error);
      })
      .finally(() => {
        delete pendingRoleChecks[userId];
      });
  }

  function redirectIfInternalUserOnPlayerPage(options) {
    const opts = options || {};
    const user = opts.user === undefined ? getLocalUser() : opts.user;
    const access = getAccessInfo(user);

    if (!user) return false;
    if (!access.isInternal) {
      if (opts.verify !== false) verifyRolesAndRedirectIfNeeded(user, opts);
      return false;
    }

    return redirectToRoleHome({
      user,
      basePath: opts.basePath,
      replace: opts.replace
    });
  }

  function canAccessArea(area, user) {
    const access = getAccessInfo(user === undefined ? getLocalUser() : user);
    const normalizedArea = normalizeRoleName(area);

    if (normalizedArea === 'admin') return access.isAdmin;
    if (normalizedArea === 'taquilla') return access.isTaquilla;
    if (normalizedArea === 'usuario' || normalizedArea === 'juego') return access.isPlayer;
    return false;
  }

  window.MuchRoleAccess = {
    normalizeRoleName,
    normalizeRoles,
    getLocalUser,
    getAccessInfo,
    getPrimaryRole: (user) => getAccessInfo(user).primaryRole,
    getRoleHome,
    redirectToRoleHome,
    redirectIfInternalUserOnPlayerPage,
    verifyRolesAndRedirectIfNeeded,
    canAccessArea
  };
})(window);
