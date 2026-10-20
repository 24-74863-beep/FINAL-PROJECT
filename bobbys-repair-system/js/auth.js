(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };

  if (Auth.current()) { location.replace('app.html'); return; }

  function showTab(login) {
    $('#loginForm').style.display = login ? '' : 'none';
    $('#regForm').style.display = login ? 'none' : '';
    $('#tabLogin').classList.toggle('on', login);
    $('#tabReg').classList.toggle('on', !login);
  }
  $('#tabLogin').onclick = function () { showTab(true); };
  $('#tabReg').onclick = function () { showTab(false); };

  function showErr(id, msg) { var e = $(id); e.textContent = msg; e.classList.add('show'); }

  $('#loginForm').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target;
    var u = Auth.login(f.username.value, f.password.value);
    if (!u) { showErr('#loginErr', 'Incorrect username or password.'); return; }
    location.href = 'app.html';
  };

  $('#regForm').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target;
    try {
      var u = Auth.registerCustomer({
        name: f.name.value, phone: f.phone.value, email: f.email.value,
        address: f.address.value, username: f.username.value, password: f.password.value
      });
      Auth.login(u.username, f.password.value);
      location.href = 'app.html';
    } catch (err) { showErr('#regErr', err.message); }
  };
})();
