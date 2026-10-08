// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_tearful_psylocke.sql';
import m0001 from './0001_add_user.sql';
import m0002 from './0002_soft_kang.sql';
import m0003 from './0003_add_remote_id.sql';
import m0004 from './0004_optional_local_password.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004
    }
  }
  