import { isFresh } from './diagnostics.js';

function statusValue(item, field, apiUnavailable, rosUnavailable) {
  if (apiUnavailable) return 'API недоступний';
  if (rosUnavailable) return 'ROS недоступний';
  if (!isFresh(item)) return 'Немає даних';
  return item[field] ?? 'Немає даних';
}

export function controlStatusValues(diagnostics, apiUnavailable = false) {
  const connection = diagnostics?.connection;
  let operator = 'Немає даних';
  if (apiUnavailable) {
    operator = 'API недоступний';
  } else if (diagnostics?.available === false) {
    operator = 'ROS недоступний';
  } else if (isFresh(connection)) {
    operator = connection.connected
      ? 'Підключений · джерело невідоме'
      : 'Не підключений';
  }

  return [
    ['Оператор · джерело', operator],
    ['Turret Mode', statusValue(
      diagnostics?.gimbal, 'mode', apiUnavailable, diagnostics?.available === false
    )],
    ['Weapon Mode', statusValue(
      diagnostics?.modes?.weapon, 'mode', apiUnavailable, diagnostics?.available === false
    )],
  ];
}
