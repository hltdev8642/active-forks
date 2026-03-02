window.addEventListener('load', () => {
  initDT(); // Initialize the DatatTable and window.columnNames variables
  document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);
  if(localStorage.getItem('darkmode') === '1') document.body.setAttribute('data-bs-theme', 'dark');

  const repo = getRepoFromUrl();

  if (repo) {
    document.getElementById('q').value = repo;
    fetchData();
  }
});

document.getElementById('form').addEventListener('submit', e => {
  e.preventDefault();
  fetchData();
});

function fetchData() {
  const repo = document.getElementById('q').value.replaceAll(' ','');
  const re = /[-_\w]+\/[-_.\w]+/;

  const urlRepo = getRepoFromUrl();

  if (!urlRepo || urlRepo !== repo) {
    window.history.pushState('', '', `#${repo}`);
  }

  if (re.test(repo)) {
    fetchAndShow(repo);
  } else {
    showMsg(
      'Invalid GitHub repository! Format is &lt;username&gt;/&lt;repo&gt;',
      'danger'
    );
  }
}

function updateDT(data) {
  // Remove any alerts, if any:
  if ($('.alert')) $('.alert').remove();

  // Format dataset and redraw DataTable. Use second index for key name
  const forks = [];
  for (let fork of data) {
    fork.repoLink = `<a href="https://github.com/${fork.full_name}">Link</a>`;
    fork.ownerName = `<img src="${fork.owner.avatar_url || 'https://avatars.githubusercontent.com/u/0?v=4'}&s=48" width="24" height="24" class="me-2 rounded-circle" />${fork.owner ? fork.owner.login : '<strike><em>Unknown</em></strike>'}`;
    fork.aheadBtn = `<button class="btn btn-sm btn-outline-success fetch-ahead py-0" data-fork="${fork.full_name}" data-fork-branch="${fork.default_branch}" aria-label="Fetch commits ahead for ${fork.full_name}">↑ Ahead</button>`;
    fork.behindBtn = `<button class="btn btn-sm btn-outline-warning fetch-behind py-0" data-fork="${fork.full_name}" data-fork-branch="${fork.default_branch}" aria-label="Fetch commits behind for ${fork.full_name}">↓ Behind</button>`;
    forks.push(fork);
  }
  const dataSet = forks.map(fork =>
    window.columnNamesMap.map(colNM => fork[colNM[1]])
  );
  window.forkTable
    .clear()
    .rows.add(dataSet)
    .draw();
  makeTableKeyboardScrollable();
}

// Will replace with JavaScript Temporal once supported in major browsers
function howLongAgo(date) {
  const relTime = new Intl.RelativeTimeFormat(navigator.language, { style: 'long' });
  if(!date) return 'Unknown';

  const startDateMilliseconds = Date.parse(date);
  const endDateMilliseconds = Date.parse(new Date());

  const elapsedSeconds = (endDateMilliseconds - startDateMilliseconds) / 1000;
  const elapsedHours = elapsedSeconds / 60 / 60;
  const elapsedDays = elapsedHours / 24;
  const elapsedMonths = elapsedDays / 30;
  const elapsedYears = elapsedDays / 365.25;

  if(elapsedHours < 24)
    return relTime.format(-Math.floor(elapsedHours), 'hour');
  if(elapsedDays < 31)
    return relTime.format(-Math.floor(elapsedDays), 'day');
  if(elapsedMonths < 12)
    return relTime.format(-Math.floor(elapsedMonths), 'month');
  return relTime.format(-Math.floor(elapsedYears), 'year');
}

function initDT() {
  // Create ordered Object with column name and mapped display name
  window.columnNamesMap = [
    // [ 'Repository', 'full_name' ],
    ['Link', 'repoLink'], // custom key
    ['Owner', 'ownerName'], // custom key
    ['Name', 'name'],
    ['Branch', 'default_branch'],
    ['Stars', 'stargazers_count'],
    ['Forks', 'forks'],
    ['Open Issues', 'open_issues_count'],
    ['Size', 'size'],
    ['Last Push', 'pushed_at'],
    ['Ahead', 'aheadBtn'],
    ['Behind', 'behindBtn'],
  ];

  // Sort by stars:
  const sortColName = 'Stars';
  const sortColumnIdx = window.columnNamesMap
    .map(pair => pair[0])
    .indexOf(sortColName);

  // Use first index for readable column name
  window.forkTable = $('#forkTable').DataTable({
    columns: window.columnNamesMap.map(colNM => {
      return {
        title: colNM[0],
        render:
          colNM[1] === 'pushed_at'
            ? (data, type, _row) => {
                if (type === 'display') {
                  return howLongAgo(data);
                }
                return data;
              }
            : null,
      };
    }),
    order: [[sortColumnIdx, 'desc']],
    // paging: false,
    searchBuilder:{
      // all options at default
    }
  });
  let table = window.forkTable;
  new $.fn.dataTable.SearchBuilder(table, {});
  table.searchBuilder.container().prependTo(table.table().container());
  makeTableKeyboardScrollable();

  $('#forkTable').on('click', '.fetch-ahead, .fetch-behind', function () {
    const $btn = $(this);
    const forkFullName = $btn.data('fork');
    const forkBranch = $btn.data('fork-branch');
    const isAhead = $btn.hasClass('fetch-ahead');
    const colKey = isAhead ? 'aheadBtn' : 'behindBtn';
    const colIdx = window.columnNamesMap.map(c => c[1]).indexOf(colKey);

    $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-pulse fa-fw" aria-hidden="true"></i>');

    const forkOwner = forkFullName.split('/')[0];
    fetch(`https://api.github.com/repos/${window.currentRepo}/compare/${window.parentDefaultBranch}...${forkOwner}:${forkBranch}`)
      .then(r => {
        if (!r.ok) throw Error(r.statusText);
        return r.json();
      })
      .then(data => {
        const count = isAhead ? data.ahead_by : data.behind_by;
        const badgeClass = isAhead ? 'bg-success' : 'bg-warning text-dark';
        const arrow = isAhead ? '↑' : '↓';
        const newHtml = `<span class="badge ${badgeClass}">${arrow} ${count}</span>`;
        window.forkTable.rows().every(function () {
          const rowData = this.data();
          if (rowData[0] && rowData[0].indexOf(`href="https://github.com/${forkFullName}"`) > -1) {
            window.forkTable.cell(this.index(), colIdx).data(newHtml).draw(false);
            return false;
          }
        });
      })
      .catch(() => {
        $btn.prop('disabled', false).html(isAhead ? '↑ Ahead' : '↓ Behind');
      });
  });
}

function fetchAndShow(repo) {
  repo = repo.replace('https://github.com/', '');
  repo = repo.replace('http://github.com/', '');
  repo = repo.replace(/\.git$/, '');
  repo = repo.replace(/^\s+/, ''); // remove leading whitespace
  repo = repo.replace(/\s+$/, ''); // remove trailing whitespace
  repo = repo.replace(/^\/+/, ''); // remove leading slashes
  repo = repo.replace(/\/+$/, ''); // remove trailing slashes

  window.currentRepo = repo;

  Promise.all([
    fetch(`https://api.github.com/repos/${repo}`).then(r => {
      if (!r.ok) throw Error(r.statusText);
      return r.json();
    }),
    fetch(`https://api.github.com/repos/${repo}/forks?sort=stargazers&per_page=100`).then(r => {
      if (!r.ok) throw Error(r.statusText);
      return r.json();
    }),
  ])
    .then(([repoData, forksData]) => {
      window.parentDefaultBranch = repoData.default_branch;
      updateDT(forksData);
    })
    .catch(error => {
      const msg =
        error.toString().indexOf('Forbidden') >= 0
          ? 'Error: API Rate Limit Exceeded'
          : error;
      showMsg(`${msg}. Additional info in console`, 'danger');
      console.error(error);
    });
}

function showMsg(msg, type) {
  let alert_type = 'alert-info';

  if (type === 'danger') {
    alert_type = 'alert-danger';
  }

  document.getElementById('footer').innerHTML = '';

  document.getElementById('data-body').innerHTML = `
        <div class="alert ${alert_type} alert-dismissible fade show" role="alert">
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
            ${msg}
        </div>
    `;
}

function getRepoFromUrl() {
  const urlRepo = location.hash && location.hash.slice(1);

  return urlRepo && decodeURIComponent(urlRepo);
}

function toggleDarkMode(event) {
  const button = event.target;
  if(button.ariaPressed === 'true') button.ariaPressed = 'false';
  else button.ariaPressed = 'true';
  document.body.setAttribute('data-bs-theme', button.ariaPressed === 'true' ? 'dark' : 'light');
  localStorage.setItem('darkmode', document.body.getAttribute('data-bs-theme') === 'dark' ? 1 : 0);
}

function makeTableKeyboardScrollable() {
  const tableContainer = document.querySelector('.dt-layout-full');
  tableContainer.setAttribute('aria-labelledby', 'table-container-label');
  tableContainer.setAttribute('role', 'region');
  tableContainer.setAttribute('tabindex', '0');
  tableContainer.classList.add('table-responsive');
}