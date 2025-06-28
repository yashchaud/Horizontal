import React, { useEffect, useState } from "react";
import styled from "styled-components";
import search from "../../components/images/search.svg";
import Profilephoto from "../../components/userprofile/profilephoto";
import Back from "../../components/images/leftarrow.svg";
import axios from "axios";
import { Link } from "react-router-dom";
import ServerBar from "@/components/servers/Serverbar";
import { ScrollArea } from "@ui/scroll-area";
import { useSelector, useDispatch } from "react-redux";
import { setMessageFlag } from "@/Redux/sessionSlice";
import { useNavigate } from "react-router-dom";

const Messages = () => {
  const [query, setquery] = useState("");
  const navigate = useNavigate();
  const [users, setusers] = useState([]);
  const dispatch = useDispatch();
  const { MessageFlag } = useSelector((state) => state.counterSlice);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("/api/users/users/getusers");
        setusers(response.data);
        console.log(response.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, []);
  return (
    <div className="flex w-[100%]">
      <Cover>
        <ScrollArea className="w-full h-full">
          <Topdiv className="p-2">
            <div className="flex justify-between object-center gap-6">
              <img
                className="cursor-pointer block"
                onClick={() => dispatch(setMessageFlag(true))}
                src={Back}
                alt=""
              />
              <h1>Messages</h1>
            </div>
            <div className="addfriend">
              <div className="imgdiv"></div>
              <button>Add Friends</button>
            </div>
          </Topdiv>
          <Searchdiv className="mt-6">
            <input
              onChange={(e) => setquery(e.target.value)}
              type="text"
              placeholder="Search"
            />
            <img src={search} alt="" />
          </Searchdiv>
          <ChatsMaindiv>
            {users
              .filter((user) =>
                user.username.toLowerCase().includes(query.toLowerCase())
              )
              .map((user) => (
                <div
                  className="Childcontainer "
                  key={user._id}
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/@me/${user._id}`);
                  }}
                >
                  <div className="profilediv">
                    <Profilephoto />
                  </div>

                  <p>{user.username}</p>
                </div>
              ))}
          </ChatsMaindiv>
        </ScrollArea>
      </Cover>
    </div>
  );
};

{
  /* <Link
                  exact
                  style={{ textDecoration: "none" }}
                  to={`/@mobileme/${user._id}`}
                  key={user._id}
                >
                  <div className="Childcontainer " key={user._id}>
                    <div className="profilediv">
                      <Profilephoto />
                    </div>

                    <p>{user.username}</p>
                  </div>
                </Link> */
}

export default Messages;

const Cover = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  flex-direction: column;
  background-color: #1e1f22;
  color: white;
  gap: 1rem;
  padding: 1rem;
  padding-inline: 1.5rem;
`;

const Topdiv = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-content: space-between;
  h1 {
    font-size: 1.5rem;
    font-weight: bold;
    color: #d8d8d8;
    word-spacing: 1px;
    letter-spacing: 0.1px;
    margin-bottom: 0.5rem;
  }
  img {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    object-fit: cover;
  }
  .addfriend {
    display: flex;
    align-items: center;
    gap: 1rem;
    button {
      background-color: #353535;
      color: #c8c8c8;
      border: none;
      border-radius: 1rem;
      padding: 0.5rem;
      font-size: 0.8rem;
      font-family: "Cabin", sans-serif;
      font-weight: bold;
      cursor: pointer;
      padding-inline: 1.2rem;
    }
  }
  @media (max-width: 406px) {
    flex-direction: column;
    justify-content: start;
    align-items: start;
  }
`;

const Searchdiv = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  margin-bottom: 1rem;
  input {
    width: 100%;
    height: 2rem;
    padding: 0.4rem;
    border: none;
    border-radius: 2rem;
    background-color: #0e0e0f;
    color: white;
    font-size: 0.8rem;
    font-family: "Cabin", sans-serif;
    font-weight: bold;
    padding-inline: 2.5rem;
    outline: none;
  }
  img {
    width: 1.5rem;
    height: 1.5rem;
    pointer-events: none;
    position: absolute;
    left: 0.8rem;
  }
`;
const ChatsMaindiv = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  justify-content: center;
  padding: 0.5rem;
  .Childcontainer {
    width: 100%;
    height: 4rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-left: 1rem;
    border-radius: 0.5rem;

    background-color: #19191918;

    p {
      font-size: 0.8rem;
      color: #959595d0;
      word-spacing: 1px;
      letter-spacing: 0.1px;
      margin-bottom: 0.5rem;
      font-weight: bold;
      font-family: "Cabin", sans-serif;
      cursor: pointer;
    }
    .profilediv {
      width: 3rem;
      height: 3rem;
    }
  }
`;
