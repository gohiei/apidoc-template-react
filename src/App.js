import { QueryClient, QueryClientProvider, useQuery } from 'react-query';
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, useLocation, Link } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import axios from 'axios';
import qs from 'qs';
import { a11yDark as dark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'semantic-ui-css/semantic.min.css';
import {
  Grid,
  Header,
  Input,
  Menu,
  Segment,
  Sidebar,
  Container,
  Label,
  Message,
  Table,
  Tab,
  Modal,
  Form,
  Icon,
  Divider,
  Button,
} from 'semantic-ui-react';
import './App.css';

const METHOD_COLORS = {
  GET: 'green',
  DELETE: 'red',
  POST: 'orange',
  PUT: 'yellow',
};

const FIELD_TYPE_COLOR = {
  Header: 'yellow',
  Query: 'green',
  Body: 'blue',
}

const FIELD_TYPE_ORDER = {
  Header: 1,
  Query: 2,
  Body: 3,
};

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <ApiBoard />
      </Router>
    </QueryClientProvider>
  );
}

function GetApiData() {
  return fetch('./api_data.json').then((res) => res.json());
}

function GetProjectData() {
  return fetch('./api_project.json').then((res) => res.json());
}

function useApiData() {
  const { isLoading, error, data } = useQuery('apiData', GetApiData);

  if (isLoading) {
    return {
      groups: [],
      apis: [],
    };
  }

  if (error) {
    return 'Error: ' + error.message;
  }

  const uniGroups = new Set();

  data.forEach((api) => {
    uniGroups.add(api.group);
  });

  const groups = Array.from(uniGroups);

  return {
    groups,
    apis: data,
  };
}

function useProjectData() {
  const { isLoading, error, data } = useQuery('projectData', GetProjectData);

  if (isLoading) {
    return 'Loading';
  }

  if (error) {
    return 'Error: ' + error.message;
  }

  return data;
}

/**
 * Entry point
 */
function ApiBoard() {
  const [visible, setVisible] = useState(true);
  const [activeApi, setActiveApi] = useState({});
  const [readmeOpened, setReadmeOpened] = useState(false);
  const { header = {}, generator = {} } = useProjectData();

  return (
    <>
      <Grid columns={1} className='app'>
        <Grid.Column>
          <Sidebar.Pushable as={Container} fluid>
            <GroupMenu
              visible={visible}
              activeApi={activeApi}
              setActiveApi={setActiveApi}
              hideReadme={() => setReadmeOpened(false)}
            />

            <Sidebar.Pusher className={visible ? 'main-content fit' : 'main-content wide'}>
              <Segment basic padded>
                <div>
                  <Label
                    as='a'
                    color='blue'
                    content='Menu'
                    onClick={() => setVisible(!visible)}
                    icon={visible ? 'backward' : 'forward'}
                  />

                  <Label
                    color='teal'
                    icon='calendar alternate outline'
                    content={generator.time}
                  />

                  <Label
                    as='a'
                    color='green'
                    icon='question'
                    content={header.title}
                    onClick={() => setReadmeOpened(!readmeOpened)}
                  />
                </div>

                <Divider />

                <MainContent
                  activeApi={activeApi}
                  setActiveApi={setActiveApi}
                />
              </Segment>
            </Sidebar.Pusher>
          </Sidebar.Pushable>
        </Grid.Column>
      </Grid>

      <Modal
        className='readme-modal'
        closeIcon
        size='fullscreen'
        open={readmeOpened}
        onClose={() => setReadmeOpened(false)}
        content={<div dangerouslySetInnerHTML={{ __html: header.content }} />}
      />
    </>
  );
}

/**
 * Send request
 *
 * @param {*} host
 * @param {*} method
 * @param {*} uri
 * @param {*} fields
 * @returns
 */
async function sendRequest(host, method, uri, fields) {
  const usedFields = [];

  uri = (() => {
    const urlPieces = uri.split('/');

    urlPieces.forEach((piece, index) => {
      if (!piece.startsWith(':')) {
        return;
      }

      const [, fieldName] = piece.split(/[:(]+/);

      const field = fields.find((field) => field.name === fieldName && !field.removed);

      if (!field || field.value.toString().length === 0) {
        return;
      }

      usedFields.push(field.name);

      urlPieces[index] = field.value;
    });

    return urlPieces.join('/');
  })();

  const headers = {};
  const query = {};
  const body = {};

  if (method.toUpperCase() !== 'GET') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
  }

  const filteredFields = fields
    .filter(f => !f.removed)
    .filter(f => !usedFields.includes(f.name))
    .filter(f => f.value.toString().length > 0);

  filteredFields
    .filter((f) => f.type === 'Header')
    .forEach((f) => {
      headers[f.name] = f.value;
    });

  filteredFields
    .filter((f) => f.type === 'Query')
    .forEach((f) => {
      query[f.name] = f.value;
    });

  filteredFields
    .filter((f) => f.type === 'Body')
    .forEach((f) => {
      body[f.name] = f.value;
    });

  const config = {
    method,
    url: uri,
    headers,
    paramsSerializer(params) {
      return qs.stringify(params);
    },
  };

  if (Object.keys(body).length > 0) {
    config.data = qs.stringify(body);
  }

  if (Object.keys(query).length > 0) {
    config.params = query;
  }

  const res = await axios(config).catch(e => e.message);

  return {
    response: res,
    axios: { ...config, baseURL: host },
    curl: { method, host, uri, headers, query, body },
  };
}

/**
 * 轉換名稱為陣列
 *
 * @param {string} name
 * @returns
 */
function convertName(name) {
  if (!name.includes('.')) {
    return name;
  }

  return name.split('.').map((p, i) => i === 0 ? p : `[${p}]`).join('');
}

/**
 * A simple request form
 */
function RequestForm({ activeApi }) {
  const [fields, setFields] = useState([]);
  const [host, setHost] = useState('');
  const [response, setResponse] = useState('{}');
  const [axiosData, setAxiosData] = useState('');
  const [curlData, setCurlData] = useState('');

  const sortedFields = [...fields];
  sortedFields.sort((a, b) => (FIELD_TYPE_ORDER[a.type] - FIELD_TYPE_ORDER[b.type]));

  useEffect(() => {
    const { type: method, parameter, header } = activeApi;
    const type = method === 'GET' ? 'Query' : 'Body';

    if (!parameter) {
      return;
    }

    const newFields = [];

    header?.fields?.Header && header.fields.Header.forEach(({ field }) => {
      newFields.push({
        id: newFields.length,
        name: convertName(field),
        value: '',
        type: 'Header',
        removed: false,
      });
    });

    parameter.fields.Parameter.forEach(({ field }) => {
      newFields.push({
        id: newFields.length,
        name: convertName(field),
        value: '',
        type,
        removed: false,
      });
    });

    setFields(newFields);
  }, [activeApi]);

  const add = (event, { content: type }) => {
    fields.push({
      id: fields.length,
      name: '',
      value: '',
      type,
      removed: false,
    });
    setFields([...fields]);
  };

  const remove = (event, { 'data-id': id }) => {
    fields.find(f => f.id === id).removed = true;
    setFields([...fields]);
  };

  const editName = (event, { 'data-id': id, value }) => {
    fields.find(f => f.id === id).name = value;
    setFields([...fields]);
  };

  const editValue = (event, { 'data-id': id, value }) => {
    const field = fields.find(f => f.id === id);

    field.value = value;

    setFields([...fields]);
  };

  const copy = (event, { 'data-id': id }) => {
    fields.push({ ...fields.find(f => f.id === id), id: fields.length });
    setFields([...fields]);
  };

  const setAxios = (config) => {
    const data = `import axios from 'axios';\n\nconst res = axios(${JSON.stringify(config, null, 2)});`;
    setAxiosData(data);
  };

  const setCurl = ({ method, host, uri, headers, query, body }) => {
    let data = `curl -X ${method} "${host}`;

    if (host.endsWith('/')) {
      if (uri.startsWith('/')) {
        data += uri.substr(1);
      }

      if (!uri.startsWith('/')) {
        data += uri;
      }
    }

    if (!host.endsWith('/')) {
      data += uri.startsWith('/') ? '/' : '';
      data += uri;
    }

    if (query && Object.keys(query).length > 0) {
      data += '?' + qs.stringify(query);
    }

    data += `" \\\n`;

    headers && Object.keys(headers).forEach((field) => {
      data += `  -H "${field}: ${headers[field]}" \\\n`;
    });

    body && Object.keys(body).forEach((field) => {
      data += `  -d "${field}=${body[field]}" \\\n`;
    });

    setCurlData(data);
  };

  const send = async () => {
    const { type: method, url } = activeApi;
    const { response: res, axios, curl } = await sendRequest(host, method, url, fields);

    setResponse(res);
    setAxios(axios);
    setCurl(curl);
  };

  return (
    <Form>
      <div>
        <Label as='a' icon='plus' color={FIELD_TYPE_COLOR.Query} onClick={add} content='Query' />
        <Label as='a' icon='plus' color={FIELD_TYPE_COLOR.Body} onClick={add} content='Body' />
        <Label
          as='a'
          icon='plus'
          color={FIELD_TYPE_COLOR.Header}
          onClick={add}
          content='Header'
        />
      </div>

      <Divider hidden />

      {sortedFields
        .filter(({ removed }) => !removed)
        .map(({ id, type, name, value }) => (
          <Form.Group inline key={id}>
            <Form.Field>
              <Input
                size='small'
                labelPosition='left corner'
                label={{ size: 'mini', color: FIELD_TYPE_COLOR[type] }}
                data-id={id}
                value={name}
                onChange={editName}
              />
            </Form.Field>
            <Form.Input
              label='='
              size='small'
              data-id={id}
              value={value}
              onChange={editValue}
            />
            <Icon
              circular
              name='trash alternate outline'
              color='red'
              data-id={id}
              onClick={remove}
            />
            <Icon
              circular
              name='copy outline'
              color='blue'
              data-id={id}
              onClick={copy}
            />
          </Form.Group>
        ))}

      <Button color='blue' type='submit' onClick={send} content='Submit' />

      <SyntaxHighlighter language='json' style={dark}>
        {JSON.stringify(response?.data || response || '', null, 2)}
      </SyntaxHighlighter>

      <Tab panes={[
        {
          menuItem: 'axios',
          render: () => (
            <SyntaxHighlighter language='javascript' style={dark}>
              {axiosData}
            </SyntaxHighlighter>
          ),
        },
        {
          menuItem: 'curl',
          render: () => (
            <SyntaxHighlighter language='shell' style={dark}>
              {curlData}
            </SyntaxHighlighter>
          ),
        },
      ]} />
    </Form>
  );
}

/**
 * Api group menu
 */
function GroupMenu({ visible, activeApi, setActiveApi, hideReadme }) {
  const { apis } = useApiData();
  const [searchText, setSearchText] = useState('');
  const location = useLocation();

  const setApi = () => {
    const [, prefix, group, name] = location.hash.split(/[#-]/);

    if (!prefix || prefix !== 'api') {
      return;
    }

    if (name) {
      const api = apis.find(i => i.group === group && i.name === name);
      !!api && setActiveApi(api) && hideReadme();
    }

    if (!name) {
      hideReadme();
      setSearchText(group);
    }
  };

  useEffect(setApi, [location, apis]);

  const filteredApis = apis.filter(
    (api) =>
      searchText.length === 0 ||
      api.name.includes(searchText) ||
      api.title.includes(searchText) ||
      api.group.includes(searchText) ||
      api.url.includes(searchText) ||
      (api.parameter &&
        api.parameter.fields.Parameter.find(
          (param) =>
            param.field.includes(searchText) ||
            param.description.includes(searchText)
        ))
  );
  const filteredGroups = Array.from(
    new Set(filteredApis.map((api) => api.group))
  );

  return (
    <Sidebar
      as={Menu}
      animation='slide along'
      vertical
      visible={visible}
      inverted
    >
      <Menu.Item className='sticky'>
        <Input
          value={searchText}
          icon='search'
          placeholder='Search'
          onChange={(event) => setSearchText(event.target.value)}
        />
      </Menu.Item>

      {filteredGroups.map((group) => (
        <Menu.Item id={`api-${group}`} key={group}>
          <Menu.Header>{group}</Menu.Header>
          <Menu.Menu>
            {filteredApis
              .filter((api) => api.group === group)
              .map((api) => (
                <Menu.Item
                  as={Link}
                  key={api.name}
                  id={`api-${group}-${api.name}`}
                  name={api.name}
                  active={activeApi.name === api.name}
                  to={`#api-${group}-${api.name}`}
                >
                    <Label className="icon" circular empty size='mini' color={METHOD_COLORS[api.type]} />
                    {api.deprecated && <Icon name='delete' />}
                    {api.title}
                </Menu.Item>
              ))}
          </Menu.Menu>
        </Menu.Item>
      ))}
    </Sidebar>
  );
}

/**
 * Main content for api description and request form
 */
function MainContent({ activeApi: api, setActiveApi }) {
  const { apis } = useApiData();

  if (!api.name && apis.length > 0) {
    setActiveApi(apis[0]);
    return '';
  }

  return (
    <Grid divided='vertically'>
      <Grid.Row columns={2}>
        <Grid.Column>
          <Header
            as='h1'
            content={`${api.group || 'Loading'} - ${api.title || 'Loading'}`}
            subheader={api.version}
          />

          {api.deprecated && (
            <Message
              color='red'
              content={`Deprecated!!!` + (api.deprecated?.content ? `\n${api.deprecated.content}` : '')}
            />
          )}

          {api.description && (
            <Message
              info
              content={remove_html(api.description)}
            />
          )}

          {!!api.type && api.type.split('|').map(type => (<Label color={METHOD_COLORS[type]} content={type} />))}

          <Message className='method-url'>
            {api.url}
          </Message>

          <FieldTable
            name={'Header'}
            fieldName='Header'
            parameter={api.header}
          />

          <FieldTable
            name={'Parameter'}
            fieldName='Parameter'
            parameter={api.parameter}
          />
          <FieldTable
            name={'Success 200'}
            fieldName='Success 200'
            parameter={api.success}
          />
          <FieldTable
            name={'Error 4xx'}
            fieldName='Error 4xx'
            parameter={api.error}
          />

          <FieldTable
            name={'Error 200'}
            fieldName='Error 200'
            parameter={api.error}
          />

          <Example examples={api?.success?.examples} />
        </Grid.Column>
        <Grid.Column>
          <RequestForm activeApi={api} />
        </Grid.Column>
      </Grid.Row>
    </Grid>
  );
}

/**
 * Example
 */
function Example({ examples }) {
  if (!examples) {
    return <div />;
  }

  const panes = examples.map((example) => ({
    menuItem: example.title,
    render: () => (
      <SyntaxHighlighter language={example.type} style={dark}>
        {example.content}
      </SyntaxHighlighter>
    ),
  }));

  return <Tab panes={panes} />;
}

/**
 * Field table for paremeter, success, and error
 */
function FieldTable({ name, fieldName, parameter }) {
  if (!parameter || !parameter.fields || !(fieldName in parameter.fields)) {
    return null;
  }

  const sortedFields = [...parameter.fields[fieldName]];
  fieldName !== 'Parameter' && sortedFields.sort((a ,b) => {

    if (a.group in FIELD_TYPE_ORDER) {
      const ret = FIELD_TYPE_ORDER[a.group] - FIELD_TYPE_ORDER[b.group];

      if (!ret) {
        return ret;
      }
    }

    return (a.field > b.field) ? 1 : -1;
  });

  return (
    <>
      <Header as='h2'>{name}</Header>
      <Table celled>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell width={5}>Field</Table.HeaderCell>
            <Table.HeaderCell width={2}>Type</Table.HeaderCell>
            <Table.HeaderCell width={9}>Description</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sortedFields.map((param) => (
            <FieldTableRow key={param.field} param={param} />
          ))}
        </Table.Body>
      </Table>
    </>
  );
}

/**
 * Field row
 */
function FieldTableRow({ param }) {
  const fields = param.field.split('.');
  const field = '　'.repeat(fields.length - 1) + fields[fields.length - 1];

  return (
    <Table.Row>
      <Table.Cell>
        {`${field}`}
        {param.optional && <Label style={{float: 'right'}} content='Optional' size='mini' />}
      </Table.Cell>
      <Table.Cell>{param.type}</Table.Cell>
      <Table.Cell>
        {param.description.replace('<p>', '').replace('</p>', '')}
        <Notice prefix='Default value:' msg={param.defaultValue} />
        <Notice
          prefix='Allowed values:'
          msg={
            param.allowedValues &&
            param.allowedValues.map((v) => (
              <Tag content={v.replaceAll('"', '')} />
            ))
          }
        />
        <Notice prefix='Range:' msg={param.size} />
      </Table.Cell>
    </Table.Row>
  );
}

/**
 * Notice
 */
function Notice({ prefix, msg }) {
  if (!msg) {
    return null;
  }

  const component = typeof msg === 'object' ? msg : <Tag content={msg} />;

  return (
    <p>
      {prefix} {component}
    </p>
  );
}

/**
 * Tag
 */
function Tag({ content }) {
  return <Label basic color='red' size='mini' content={content} />;
}

/**
 * A simple way to remove html
 *
 * @param {string} str
 * @return {string}
 */
function remove_html(str) {
  return str.replace(/<[^>]+>/g, '');
}

export default App;
