-- La dotacion pasa a ser POR PUESTO y POR DIA DE LA SEMANA.
-- Antes era "5 personas" en dos perfiles (L-J y V-D). El numero total puede
-- cuadrar y el local no funcionar: 5 garzones y ningun cocinero. Y viernes,
-- sabado y domingo no se parecen en nada entre si.
alter table dotacion add column if not exists puesto text not null default '';
alter table dotacion drop constraint if exists dotacion_pkey;
alter table dotacion add primary key (local_id, perfil, puesto, hora);
-- Las filas viejas no tienen puesto y usan los perfiles antiguos: se borran.
delete from dotacion where puesto = '' or perfil in ('semana','finde');
